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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const audioTrack = stream.getAudioTracks()[0];
      localTrackRef.current = audioTrack;

      // 2. Create CF Calls session → get sessionId + SDP offer from CF
      const sessionRes = await fetch('/api/calls/session', { method: 'POST' });
      if (!sessionRes.ok) throw new Error('Failed to create voice session');
      const { sessionId, sdp: offerSdp } = await sessionRes.json() as { sessionId: string; sdp: string };
      sessionIdRef.current = sessionId;

      // 3. Create peer connection
      const pc = new RTCPeerConnection(STUN);
      pcRef.current = pc;

      // Wire up incoming remote tracks → play audio
      pc.ontrack = (event) => {
        const stream = event.streams[0];
        if (!stream) return;
        // Match to a playerId via the voiceTracks list in game state
        // We use the track's stream id as a key; we'll associate by order of subscription
        const audio = new Audio();
        audio.srcObject = stream;
        audio.autoplay = true;
        audio.play().catch(() => { /* autoplay blocked — user gesture needed */ });
        // Store by stream id temporarily; reassociated in subscribeToTracks
        audioElemsRef.current.set(stream.id, audio);
      };

      // 4. Add local audio transceiver (send-only)
      const transceiver = pc.addTransceiver(audioTrack, { direction: 'sendonly' });

      // 5. Set CF's offer as remote description
      await pc.setRemoteDescription({ type: 'offer', sdp: offerSdp });

      // 6. Create and set local answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // 7. Publish local track → get trackName back from CF
      const publishRes = await fetch('/api/calls/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, sdp: answer.sdp, mid: transceiver.mid }),
      });
      if (!publishRes.ok) throw new Error('Failed to publish audio track');
      const { trackName } = await publishRes.json() as { trackName: string };

      // 8. Signal to other players via game WebSocket
      send({ type: 'voice-track', payload: { sessionId, trackName } });

      setJoined(true);

      // 9. Subscribe to any players already in voice
      if (gameState?.voiceTracks.length) {
        await subscribeToTracks(pc, sessionId, gameState.voiceTracks);
      }
    } catch (err) {
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
      const subscribeRes = await fetch('/api/calls/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: mySessionId,
          remoteTracks: newTracks.map(t => ({ sessionId: t.sessionId, trackName: t.trackName })),
        }),
      });
      if (!subscribeRes.ok) return;
      const { sdp: offerSdp } = await subscribeRes.json() as { sdp: string };
      if (!offerSdp) return;

      await pc.setRemoteDescription({ type: 'offer', sdp: offerSdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await fetch('/api/calls/renegotiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: mySessionId, sdp: answer.sdp }),
      });

      for (const t of newTracks) {
        subscribedRef.current.set(t.playerId, `${t.sessionId}:${t.trackName}`);
      }
    } catch {
      // Non-fatal — remote audio just won't play
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
