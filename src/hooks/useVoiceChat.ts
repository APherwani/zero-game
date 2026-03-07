'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { ClientGameState, VoiceTrack } from '@/lib/types';
import type { ClientMessage } from '@/lib/ws-protocol';

type SendFn = (msg: ClientMessage) => void;

const STUN = { iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }] };

export function useVoiceChat(gameState: ClientGameState | null, send: SendFn) {
  const [joined, setJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const localTrackRef = useRef<MediaStreamTrack | null>(null);
  // Map of playerId -> RemoteTrack key already subscribed (sessionId:trackName)
  const subscribedRef = useRef<Map<string, string>>(new Map());
  // Map of playerId -> HTMLAudioElement
  const audioElemsRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  // ── Join voice ────────────────────────────────────────────────────

  const joinVoice = useCallback(async () => {
    if (joined) return;
    setError(null);
    try {
      // 1. Get microphone
      console.log('[voice] requesting microphone');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const audioTrack = stream.getAudioTracks()[0];
      console.log('[voice] got audio track:', audioTrack.label);
      localTrackRef.current = audioTrack;

      // 2. Create RTCPeerConnection first (client-side offer flow)
      const pc = new RTCPeerConnection(STUN);
      pcRef.current = pc;
      pc.onconnectionstatechange = () => console.log('[voice] pc connectionState:', pc.connectionState);
      pc.oniceconnectionstatechange = () => console.log('[voice] pc iceConnectionState:', pc.iceConnectionState);

      // Wire up incoming remote tracks → play audio
      pc.ontrack = (event) => {
        const stream = event.streams[0];
        console.log('[voice] ontrack fired, stream id:', stream?.id);
        if (!stream) return;
        const audio = new Audio();
        audio.srcObject = stream;
        audio.autoplay = true;
        audio.play().catch((e) => console.warn('[voice] autoplay blocked:', e));
        audioElemsRef.current.set(stream.id, audio);
      };

      // 3. Add local audio transceiver (send-only)
      const transceiver = pc.addTransceiver(audioTrack, { direction: 'sendonly' });
      console.log('[voice] transceiver mid:', transceiver.mid);

      // 4. Create SDP offer on the client
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      console.log('[voice] offer sdp length:', offer.sdp?.length ?? 0, '| first 60:', offer.sdp?.slice(0, 60));

      // 5. Create CF SFU session → sessionId only (no SDP at this stage)
      console.log('[voice] creating SFU session');
      const sessionRes = await fetch('/api/calls/session', { method: 'POST' });
      console.log('[voice] session response status:', sessionRes.status);
      const sessionRaw = await sessionRes.json() as { sessionId: string };
      console.log('[voice] session response body:', JSON.stringify(sessionRaw));
      if (!sessionRes.ok) throw new Error('Failed to create voice session');
      const { sessionId } = sessionRaw;
      console.log('[voice] sessionId:', sessionId);
      sessionIdRef.current = sessionId;

      // 6. Publish track: send client offer → CF returns answer SDP + trackName
      console.log('[voice] publishing track, mid:', transceiver.mid);
      const publishRes = await fetch('/api/calls/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, sdp: offer.sdp, mid: transceiver.mid }),
      });
      console.log('[voice] publish response status:', publishRes.status);
      const publishData = await publishRes.json() as { trackName: string; answerSdp: string };
      console.log('[voice] publish response body:', JSON.stringify({ trackName: publishData.trackName, answerSdpLen: publishData.answerSdp?.length }));
      if (!publishRes.ok) throw new Error('Failed to publish audio track');
      const { trackName, answerSdp } = publishData;

      // 7. Set CF's answer as remote description
      console.log('[voice] setRemoteDescription (answer), sdp length:', answerSdp?.length ?? 0);
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

      // 8. Signal to other players via game WebSocket
      console.log('[voice] signalling trackName:', trackName);
      send({ type: 'voice-track', payload: { sessionId, trackName } });

      setJoined(true);

      // 9. Subscribe to any players already in voice
      if (gameState?.voiceTracks.length) {
        console.log('[voice] subscribing to existing tracks:', gameState.voiceTracks);
        await subscribeToTracks(pc, sessionId, gameState.voiceTracks);
      }
    } catch (err) {
      console.error('[voice] joinVoice error:', err);
      setError(err instanceof Error ? err.message : 'Could not join voice');
      cleanup();
    }
  }, [joined, gameState, send]);

  // ── Subscribe to remote tracks ────────────────────────────────────

  const subscribeToTracks = useCallback(async (
    pc: RTCPeerConnection,
    mySessionId: string,
    tracks: VoiceTrack[],
  ) => {
    const newTracks = tracks.filter(t => {
      const key = `${t.sessionId}:${t.trackName}`;
      return !subscribedRef.current.has(t.playerId) || subscribedRef.current.get(t.playerId) !== key;
    });
    if (!newTracks.length) return;

    try {
      console.log('[voice] subscribing to tracks:', newTracks);
      const subscribeRes = await fetch('/api/calls/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: mySessionId,
          remoteTracks: newTracks.map(t => ({ sessionId: t.sessionId, trackName: t.trackName })),
        }),
      });
      console.log('[voice] subscribe response status:', subscribeRes.status);
      const subscribeData = await subscribeRes.json() as { sdp: string };
      console.log('[voice] subscribe response body:', JSON.stringify(subscribeData));
      if (!subscribeRes.ok) return;
      const { sdp: offerSdp } = subscribeData;
      if (!offerSdp) { console.warn('[voice] subscribe returned no SDP'); return; }

      console.log('[voice] setRemoteDescription for subscription, sdp length:', offerSdp.length);
      await pc.setRemoteDescription({ type: 'offer', sdp: offerSdp });
      const answer = await pc.createAnswer();
      console.log('[voice] renegotiate answer sdp length:', answer.sdp?.length ?? 0);
      await pc.setLocalDescription(answer);

      const regenRes = await fetch('/api/calls/renegotiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: mySessionId, sdp: answer.sdp }),
      });
      console.log('[voice] renegotiate response status:', regenRes.status);

      for (const t of newTracks) {
        subscribedRef.current.set(t.playerId, `${t.sessionId}:${t.trackName}`);
      }
    } catch (err) {
      console.error('[voice] subscribeToTracks error:', err);
    }
  }, []);

  // ── React to voiceTracks changes (new players joining voice) ──────

  useEffect(() => {
    if (!joined || !pcRef.current || !sessionIdRef.current) return;
    const remoteTracks = (gameState?.voiceTracks ?? []).filter(
      t => t.playerId !== gameState?.playerId
    );
    if (!remoteTracks.length) return;
    subscribeToTracks(pcRef.current, sessionIdRef.current, remoteTracks);
  }, [joined, gameState?.voiceTracks, gameState?.playerId, subscribeToTracks]);

  // ── Leave voice ───────────────────────────────────────────────────

  const cleanup = useCallback(() => {
    localTrackRef.current?.stop();
    localTrackRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    sessionIdRef.current = null;
    subscribedRef.current.clear();
    for (const audio of audioElemsRef.current.values()) {
      audio.pause();
      audio.srcObject = null;
    }
    audioElemsRef.current.clear();
    setJoined(false);
    setMuted(false);
  }, []);

  const leaveVoice = useCallback(() => {
    send({ type: 'voice-leave' });
    cleanup();
  }, [send, cleanup]);

  // Clean up if component unmounts while in voice
  useEffect(() => () => { if (joined) cleanup(); }, [joined, cleanup]);

  // ── Toggle mute ───────────────────────────────────────────────────

  const toggleMute = useCallback(() => {
    if (!localTrackRef.current) return;
    localTrackRef.current.enabled = !localTrackRef.current.enabled;
    setMuted(m => !m);
  }, []);

  return { joined, muted, error, joinVoice, leaveVoice, toggleMute };
}
