'use client';

import Link from 'next/link';
import { useState } from 'react';

const SECTIONS = [
  {
    title: 'Overview',
    icon: '🃏',
    content: (
      <div className="space-y-4">
        <p>
          Zero Game is a <strong>trick-taking card game</strong> for 3-7 players using a standard 52-card deck.
        </p>
        <p>
          The goal is simple: <strong>predict exactly how many tricks you will win</strong> each round.
          Get it right and you score points. Get it wrong and you score nothing.
        </p>
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-yellow-200 text-sm">
          The best players balance risk and reward -- bidding zero is safe but bidding high pays more when you nail it.
        </div>
      </div>
    ),
  },
  {
    title: 'Rounds & Dealing',
    icon: '🔄',
    content: (
      <div className="space-y-4">
        <p>
          The number of rounds equals the number of players. Cards dealt <strong>decrease by one</strong> each round.
        </p>
        <div className="bg-white/5 rounded-lg p-3 text-sm">
          <p className="text-white/60 mb-2">Example with 5 players:</p>
          <div className="flex gap-2 flex-wrap">
            {[5, 4, 3, 2, 1].map((n, i) => (
              <div key={i} className="bg-white/10 rounded-lg px-3 py-2 text-center">
                <div className="text-white/50 text-xs">Round {i + 1}</div>
                <div className="text-white font-bold">{n} cards</div>
              </div>
            ))}
          </div>
        </div>
        <p>
          The <strong>dealer rotates</strong> each round, moving to the next player clockwise.
        </p>
      </div>
    ),
  },
  {
    title: 'Trump Suit',
    icon: '👑',
    content: (
      <div className="space-y-4">
        <p>
          After dealing, the top card of the remaining deck is flipped face-up. Its suit becomes the <strong>trump suit</strong> for that round.
        </p>
        <div className="flex items-center gap-4 bg-white/5 rounded-lg p-4">
          <div className="w-16 h-22 bg-white rounded-lg flex items-center justify-center text-3xl shadow-lg">
            <span className="text-red-500">♥</span>
          </div>
          <div>
            <div className="text-white font-semibold">Trump: Hearts</div>
            <div className="text-white/60 text-sm">All heart cards can beat cards of any other suit this round</div>
          </div>
        </div>
        <p className="text-white/60 text-sm">
          If no cards remain after dealing, there is no trump suit for that round.
        </p>
      </div>
    ),
  },
  {
    title: 'Bidding',
    icon: '🎯',
    content: (
      <div className="space-y-4">
        <p>
          Before playing, each player <strong>bids how many tricks</strong> they think they will win (from 0 up to the number of cards in hand).
        </p>
        <p>
          Bidding goes in order starting with the player to the left of the dealer.
        </p>
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm">
          <div className="text-red-300 font-semibold mb-1">The Hook Rule</div>
          <p className="text-red-200">
            The dealer bids last and is <strong>restricted</strong>: they cannot make a bid that causes the total of all bids to equal the number of cards dealt. This guarantees someone will miss their bid.
          </p>
          <div className="mt-2 text-red-200/80 text-xs">
            Example: 3 cards dealt, previous bids are 1 and 1. The dealer cannot bid 1 (total would be 3), so they must bid 0, 2, or 3.
          </div>
        </div>
      </div>
    ),
  },
  {
    title: 'Playing Tricks',
    icon: '🂡',
    content: (
      <div className="space-y-4">
        <p>
          The player to the left of the dealer leads the first trick by playing any card. Play continues clockwise.
        </p>
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-blue-500/30 text-blue-300 flex items-center justify-center text-sm font-bold shrink-0 mt-0.5">1</div>
            <p><strong>Follow suit:</strong> If you have a card of the lead suit, you must play it.</p>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-blue-500/30 text-blue-300 flex items-center justify-center text-sm font-bold shrink-0 mt-0.5">2</div>
            <p><strong>No lead suit?</strong> Play any card, including trump.</p>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-blue-500/30 text-blue-300 flex items-center justify-center text-sm font-bold shrink-0 mt-0.5">3</div>
            <p><strong>Who wins?</strong> Highest trump wins. If no trump was played, highest card of the lead suit wins.</p>
          </div>
        </div>
        <p className="text-white/60 text-sm">
          The trick winner leads the next trick. Cards rank from 2 (lowest) to Ace (highest).
        </p>
      </div>
    ),
  },
  {
    title: 'Scoring',
    icon: '⭐',
    content: (
      <div className="space-y-4">
        <p>At the end of each round, scores are calculated:</p>
        <div className="grid gap-3">
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
            <div className="text-green-300 font-semibold">Correct bid</div>
            <div className="text-green-200 text-sm mt-1">Score = <strong>10 + your bid</strong></div>
          </div>
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
            <div className="text-red-300 font-semibold">Wrong bid</div>
            <div className="text-red-200 text-sm mt-1">Score = <strong>0</strong></div>
          </div>
        </div>
        <div className="bg-white/5 rounded-lg p-3 text-sm">
          <p className="text-white/60 mb-2">Scoring examples:</p>
          <div className="space-y-1">
            <div className="flex justify-between">
              <span>Bid 0, won 0 tricks</span>
              <span className="text-green-400 font-bold">+10</span>
            </div>
            <div className="flex justify-between">
              <span>Bid 2, won 2 tricks</span>
              <span className="text-green-400 font-bold">+12</span>
            </div>
            <div className="flex justify-between">
              <span>Bid 3, won 1 trick</span>
              <span className="text-red-400 font-bold">+0</span>
            </div>
          </div>
        </div>
        <p>
          After all rounds, the player with the <strong>highest total score wins</strong>.
        </p>
      </div>
    ),
  },
  {
    title: 'Quick Tips',
    icon: '💡',
    content: (
      <div className="space-y-4">
        <div className="space-y-3">
          <div className="bg-white/5 rounded-lg p-3">
            <div className="font-semibold text-white">Bidding zero is safe</div>
            <div className="text-white/60 text-sm mt-1">You still get 10 points, and avoiding tricks is often easier than winning them.</div>
          </div>
          <div className="bg-white/5 rounded-lg p-3">
            <div className="font-semibold text-white">Watch the trump suit</div>
            <div className="text-white/60 text-sm mt-1">High trump cards are very powerful. Factor them into your bid.</div>
          </div>
          <div className="bg-white/5 rounded-lg p-3">
            <div className="font-semibold text-white">Track other bids</div>
            <div className="text-white/60 text-sm mt-1">If everyone bids high, try to bid low (and vice versa). The hook rule means not everyone can succeed.</div>
          </div>
          <div className="bg-white/5 rounded-lg p-3">
            <div className="font-semibold text-white">Lead strategically</div>
            <div className="text-white/60 text-sm mt-1">If you want to avoid tricks, lead with high cards early to dump them safely.</div>
          </div>
        </div>
      </div>
    ),
  },
];

export default function TutorialPage() {
  const [activeSection, setActiveSection] = useState(0);

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-900 to-green-950 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <Link
          href="/"
          className="text-white/60 hover:text-white transition-colors text-sm"
        >
          &larr; Back
        </Link>
        <h1 className="text-white font-bold text-lg">How to Play</h1>
        <div className="w-12" />
      </div>

      {/* Navigation pills */}
      <div className="px-4 py-3 overflow-x-auto">
        <div className="flex gap-2 min-w-max">
          {SECTIONS.map((section, i) => (
            <button
              key={i}
              onClick={() => setActiveSection(i)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
                activeSection === i
                  ? 'bg-yellow-500 text-black'
                  : 'bg-white/10 text-white/70 hover:bg-white/20'
              }`}
            >
              {section.icon} {section.title}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-4 overflow-y-auto">
        <div className="max-w-lg mx-auto">
          <div className="mb-4">
            <h2 className="text-2xl font-bold text-white mb-1">
              {SECTIONS[activeSection].icon} {SECTIONS[activeSection].title}
            </h2>
            <div className="flex gap-1">
              {SECTIONS.map((_, i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full transition-colors ${
                    i <= activeSection ? 'bg-yellow-500' : 'bg-white/10'
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="text-white/90 leading-relaxed">
            {SECTIONS[activeSection].content}
          </div>

          {/* Navigation buttons */}
          <div className="flex gap-3 mt-8 pb-8">
            {activeSection > 0 && (
              <button
                onClick={() => setActiveSection(activeSection - 1)}
                className="flex-1 py-3 bg-white/10 text-white font-semibold rounded-xl hover:bg-white/20 transition-colors"
              >
                Previous
              </button>
            )}
            {activeSection < SECTIONS.length - 1 ? (
              <button
                onClick={() => setActiveSection(activeSection + 1)}
                className="flex-1 py-3 bg-yellow-500 text-black font-semibold rounded-xl hover:bg-yellow-400 transition-colors"
              >
                Next
              </button>
            ) : (
              <Link
                href="/"
                className="flex-1 py-3 bg-yellow-500 text-black font-semibold rounded-xl hover:bg-yellow-400 transition-colors text-center"
              >
                Start Playing
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
