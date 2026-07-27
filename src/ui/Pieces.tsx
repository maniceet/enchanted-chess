import type { Color, Enchantment, PieceType } from '../engine/types';

export type ShieldState = 'none' | 'active' | 'dormant' | 'broken';

export interface GlyphProps {
  type: PieceType;
  color: Color;
  ench?: Enchantment | null;
  shield?: ShieldState;
  frozen?: boolean;
}

/** Classic Staunton silhouettes in a 45×45 box — the familiar chess-set proportions, drawn
 *  as fill + outline so they stay crisp at any board size. Colours come from CSS variables
 *  so an enchantment can retint a piece without touching its shape. */
const SHAPES: Record<PieceType, JSX.Element> = {
  p: (
    <>
      <circle className="pc-body" cx="22.5" cy="11.6" r="4.6" />
      <path
        className="pc-body"
        d="M22.5 16.6c-3.5 0-6 1.9-6 4.4 0 1.6.9 2.8 2.2 3.6-3.4 2.1-5.8 5.6-5.8 10.4h19.2c0-4.8-2.4-8.3-5.8-10.4 1.3-.8 2.2-2 2.2-3.6 0-2.5-2.5-4.4-6-4.4z"
      />
      <path className="pc-body" d="M12.4 34.6h20.2c1.6 0 2.6 1 2.6 2.3v2.3H9.8v-2.3c0-1.3 1-2.3 2.6-2.3z" />
    </>
  ),
  r: (
    <>
      <path className="pc-body" d="M12 11.4h4.1v3.2h4.4v-3.2h4.9v3.2h4.4v-3.2H34v8.8H12z" />
      <path className="pc-body" d="M13.4 20.2h18.2v2.6H13.4z" />
      <path className="pc-body" d="M15 22.8h15v11.2H15z" />
      <path className="pc-detail" d="M15 26.4h15M15 30.2h15" />
      <path className="pc-body" d="M11.6 34h21.8c1.6 0 2.6 1 2.6 2.4v2.8H9v-2.8c0-1.4 1-2.4 2.6-2.4z" />
    </>
  ),
  n: (
    <>
      <path
        className="pc-body"
        d="M21.4 9.2c2.7-1.1 5.4-.6 7.7 1.2 3.4 2.7 5 7.6 5 13 0 4.2-.4 7.6-.9 10.2H13.6c.2-4 1.7-6.9 4.4-9.1 1.8-1.5 2.9-2.8 3.5-4.2l-3.4 1.8c-2.2 1.1-3.9.1-3.7-2.2.3-3.3 1.8-6.2 4.1-8.4 1.3-1.2 2.3-2.2 2.9-2.3z"
      />
      <path className="pc-detail" d="M27.8 12.6c1.9 2.2 3.2 5.4 3.6 9.4" />
      <circle className="pc-eye" cx="19.4" cy="17.8" r="1.25" />
      <path className="pc-body" d="M12.6 33.8h19.8c1.6 0 2.6 1 2.6 2.4v3H10v-3c0-1.4 1-2.4 2.6-2.4z" />
    </>
  ),
  b: (
    <>
      <circle className="pc-body" cx="22.5" cy="8.4" r="2.3" />
      <path
        className="pc-body"
        d="M22.5 11c-4 2.9-6.9 7.3-6.9 11.5 0 3.5 2 6.2 4.5 7.8h4.8c2.5-1.6 4.5-4.3 4.5-7.8C29.4 18.3 26.5 13.9 22.5 11z"
      />
      <path className="pc-detail" d="M22.5 15.4v8.2M18.6 19.4h7.8" />
      <path className="pc-body" d="M16.4 30.3h12.2v3.2H16.4z" />
      <path className="pc-body" d="M11.8 33.5h21.4c1.6 0 2.6 1 2.6 2.4v3H9.2v-3c0-1.4 1-2.4 2.6-2.4z" />
    </>
  ),
  a: (
    // A bishop who has been given a mitre with two peaks and a crozier: the silhouette has to
    // separate from the plain bishop at rail size, so the head is split and the body squarer.
    <>
      <path className="pc-body" d="M22.5 5.6l3.1 4.4h-6.2z" />
      <circle className="pc-body" cx="18.6" cy="9.6" r="2" />
      <circle className="pc-body" cx="26.4" cy="9.6" r="2" />
      <path
        className="pc-body"
        d="M22.5 11.6c-4.2 3-7.2 7.4-7.2 11.6 0 3.5 2.1 6.3 4.7 7.9h5c2.6-1.6 4.7-4.4 4.7-7.9 0-4.2-3-8.6-7.2-11.6z"
      />
      <path className="pc-detail" d="M22.5 15.8v8.4M18.3 19.9h8.4M17.4 24.6h10.2" />
      <path className="pc-body" d="M16.2 30.6h12.6v3.1H16.2z" />
      <path className="pc-body" d="M11.8 33.7h21.4c1.6 0 2.6 1 2.6 2.4v3H9.2v-3c0-1.4 1-2.4 2.6-2.4z" />
    </>
  ),
  q: (
    <>
      <circle className="pc-body" cx="8.6" cy="13.8" r="2.2" />
      <circle className="pc-body" cx="15.6" cy="10.6" r="2.2" />
      <circle className="pc-body" cx="22.5" cy="9.2" r="2.4" />
      <circle className="pc-body" cx="29.4" cy="10.6" r="2.2" />
      <circle className="pc-body" cx="36.4" cy="13.8" r="2.2" />
      <path
        className="pc-body"
        d="M9.4 15.8 12.8 29h19.4l3.4-13.2-5.8 5.4-3.6-9-3.7 9-3.7-9-3.6 9z"
      />
      <path className="pc-body" d="M12.8 29h19.4v3.2H12.8z" />
      <path className="pc-detail" d="M14.6 25.4h15.8" />
      <path className="pc-body" d="M11.4 32.2h22.2c1.6 0 2.6 1 2.6 2.4v3.2H8.8v-3.2c0-1.4 1-2.4 2.6-2.4z" />
    </>
  ),
  d: (
    <>
      {/* wings out, long neck, horned head: knight's leap and bishop's diagonal in one */}
      <path
        className="pc-body"
        d="M9.4 16.2c-2.6-1.3-4.6-.9-6 1.2 2.6.5 4.2 1.9 5 4.1-2.4.6-3.8 2.1-4.2 4.4 2.8-.8 5-.3 6.7 1.4z"
      />
      <path
        className="pc-body"
        d="M35.6 16.2c2.6-1.3 4.6-.9 6 1.2-2.6.5-4.2 1.9-5 4.1 2.4.6 3.8 2.1 4.2 4.4-2.8-.8-5-.3-6.7 1.4z"
      />
      <path
        className="pc-body"
        d="M27.6 6.6c-1.2-.6-2.6-.5-3.6.4l-2.6 2.2c-2.9.5-5.2 2.4-6.4 5.2-1.2 2.8-1 5.7.4 8.2 1.4 2.4 1.6 4.4.6 6.2h12.4c-1.4-2.6-1.4-5 0-7.4 1.6-2.7 1.8-5.6.6-8.4l3.4-1.2-4.2-1.6z"
      />
      <path className="pc-detail" d="M31 9.6 34.6 8" />
      <circle className="pc-eye" cx="20.6" cy="14.2" r="1.3" />
      <path className="pc-body" d="M13.6 28.8h17.8c1.6 0 2.6 1 2.6 2.4v2.6H11v-2.6c0-1.4 1-2.4 2.6-2.4z" />
      <path className="pc-body" d="M11.2 33.6h22.6c1.6 0 2.6 1 2.6 2.4v3.2H8.6V36c0-1.4 1-2.4 2.6-2.4z" />
    </>
  ),
  k: (
    <>
      <path className="pc-cross" d="M22.5 5.4v7.4M19 8.6h7" />
      <path
        className="pc-body"
        d="M22.5 13.4c-6.2 0-11 3.9-11 8.7 0 3 1.9 5.6 4.2 7.3h13.6c2.3-1.7 4.2-4.3 4.2-7.3 0-4.8-4.8-8.7-11-8.7z"
      />
      <path className="pc-detail" d="M16.4 24.6c4-2.4 8.2-2.4 12.2 0" />
      <path className="pc-body" d="M15.4 29.4h14.2v3.2H15.4z" />
      <path className="pc-body" d="M11.2 32.6h22.6c1.6 0 2.6 1 2.6 2.4v3.2H8.6V35c0-1.4 1-2.4 2.6-2.4z" />
    </>
  ),
};

/** A piece plus its enchantment treatment. Consequences are rendered, not causes (spec §4):
 *  a Taunt shows an intact shield only while it is actually defended, a cracked shield when it
 *  is not, and nothing at all once the shield has been spent — a spent Taunt is an ordinary
 *  piece and is drawn as one. */
export function PieceGlyph({ type, color, ench = null, shield = 'none', frozen }: GlyphProps) {
  const shown = ench === 'taunt' && shield === 'broken' ? null : ench;
  const classes = [
    'piece',
    `piece-${color}`,
    shown ? `ench-${shown}` : '',
    shown === 'taunt' && shield === 'active' ? 'is-shielded' : '',
    frozen ? 'is-frozen' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <svg className={classes} viewBox="0 0 45 45" aria-hidden="true">
      {shown === 'outpost' && <ellipse className="plinth" cx="22.5" cy="39.4" rx="17" ry="3.4" />}
      <g className="pc-art">{SHAPES[type]}</g>
      {frozen && (
        /* Martyr's grip: a chain across the waist and a padlock in the corner, so "cannot
           move" reads at a glance without hiding the piece it is wrapped around. */
        <g className="chains" aria-hidden="true">
          <path className="chain-slack" d="M6.5 25.6c5 2.2 10 3.2 16 3.2s11-1 16-3.2" />
          {[8, 13, 18, 23, 28, 33].map((x, i) => (
            <ellipse
              key={x}
              className="chain-link"
              cx={x}
              cy={i % 2 ? 27.4 : 26.8}
              rx={i % 2 ? 1.5 : 2.5}
              ry={i % 2 ? 2.3 : 1.6}
            />
          ))}
          <g className="padlock" transform="translate(30.5 30) scale(0.62)">
            <path className="lock-shackle" d="M2.6 4.4V2.6a3.4 3.4 0 0 1 6.8 0v1.8" />
            <rect className="lock-body" x="0.4" y="4.2" width="11.2" height="8.6" rx="1.6" />
            <circle className="lock-hole" cx="6" cy="8" r="1.5" />
          </g>
        </g>
      )}
    </svg>
  );
}

/** Corner rune marking which enchantment a piece carries — readable without hover.
 *  Taunt has two faces: whole while the piece is defended, cracked while it is not. */
export function EnchRune({ ench, shield }: { ench: Enchantment; shield?: ShieldState }) {
  const state = ench === 'taunt' ? (shield ?? 'dormant') : 'none';
  if (ench === 'taunt' && shield === 'broken') return null;

  return (
    <svg className={`rune rune-${ench} rune-shield-${state}`} viewBox="0 0 24 24" aria-hidden="true">
      {ench === 'taunt' && (
        <>
          <path className="rune-fill" d="M12 2.4 20.4 5.3v6.4c0 5.2-3.5 9-8.4 10.3C7.1 20.7 3.6 16.9 3.6 11.7V5.3z" />
          {state !== 'active' && (
            /* Undefended: the shield is shown cracked, because Taunt is not in effect. */
            <path className="rune-crack" d="M12 3.2 9.6 9.4l4.2 2-3 5.2 2.4 3.4" />
          )}
        </>
      )}
      {ench === 'martyr' && (
        <path className="rune-fill" d="M12 2.4c4 5.4 6.6 9 6.6 12.2A6.6 6.6 0 0 1 5.4 14.6C5.4 11.4 8 7.8 12 2.4z" />
      )}
      {ench === 'outpost' && (
        <>
          <path className="rune-fill" d="M3.4 15.4h17.2v5.2H3.4z" />
          <path className="rune-fill" d="M6 9.6h12v5.2H6z" />
          <path className="rune-fill" d="M9 3.8h6v5.2H9z" />
        </>
      )}
      {ench === 'swift' && <path className="rune-stroke" d="M3 7h12M3 12h16M3 17h11" />}
      {ench === 'herald' && (
        <>
          <path className="rune-fill" d="M6 2.6h13l-3.2 5 3.2 5H6z" />
          <path className="rune-stroke" d="M6 2.6v18.8" />
        </>
      )}
      {ench === 'squire' && (
        /* Two arrows trading places, which is the whole move and matches the ⇄ the chronicle
           writes. Deliberately unlike the Herald's flag it works with: at 24px a player has to
           tell the pair apart at a glance, and one is a banner while the other is an exchange. */
        <>
          <path className="rune-stroke" d="M4.6 8.4h14.8M4.6 15.6h14.8" />
          <path className="rune-fill" d="M15.6 4.6 21 8.4l-5.4 3.8z" />
          <path className="rune-fill" d="M8.4 11.8 3 15.6l5.4 3.8z" />
        </>
      )}
      {ench === 'poison' && (
        <>
          <path className="rune-fill" d="M12 2.6a7 7 0 0 1 4.4 12.4v2.6a1.6 1.6 0 0 1-1.6 1.6H9.2a1.6 1.6 0 0 1-1.6-1.6V15A7 7 0 0 1 12 2.6z" />
          <circle className="rune-hole" cx="9.5" cy="10.4" r="1.9" />
          <circle className="rune-hole" cx="14.5" cy="10.4" r="1.9" />
        </>
      )}
      {ench === 'immolation' && (
        /* A flame with three tongues, because the blast is three squares wide. The silhouette
           has to be different from Poison's skull at 24px, since the two cost the same and a
           player deciding which is in front of them cannot afford to squint. */
        <>
          <path
            className="rune-fill"
            d="M12 1.8c3.4 3.6 5.2 6.6 5.2 9.2a5.2 5.2 0 0 1-10.4 0c0-2.6 1.8-5.6 5.2-9.2z"
          />
          <path className="rune-stroke" d="M5.2 20.8c1.4-2.4 2.2-4.2 2.4-5.6" />
          <path className="rune-stroke" d="M18.8 20.8c-1.4-2.4-2.2-4.2-2.4-5.6" />
        </>
      )}
    </svg>
  );
}

/* Mana, as a thing you can see the size of.
 *
 * It was a fraction in text — "3/6 used · 3 reserved" — in the one place a player is actually
 * deciding how to spend it, and a fraction is something you read rather than something you
 * feel. The meter is the same information at a glance: how much is gone, how much is left, and
 * how big the pool is at all, which is the number that grows over a campaign and is the reason
 * the road feels different at the eighth table than the first.
 *
 * Deliberately unlabelled. It sits beside the numbers it illustrates rather than replacing
 * them, and at ten pips wide it still fits a 320px phone. */
export function ManaMeter({
  filled,
  total,
  reserved = 0,
}: {
  /** The first number in the fraction beside it, whatever that fraction is counting.
   *
   *  Not "spent", which is what this was called and which was wrong in half the places it is
   *  used: the builder's label reads "4/7 used" and the spoils footer reads "Mana 6 of 10", so
   *  the same widget was lighting up spent points on one screen and remaining points on the
   *  other. It illustrates the number it sits next to — that is the rule, and the prop is named
   *  for it now so the next caller cannot get it backwards. */
  filled: number;
  total: number;
  /** Points held back on purpose — Revive's price. Shown apart from what is simply unspent. */
  reserved?: number;
}) {
  const pips = Math.max(0, Math.min(20, Math.round(total)));
  const used = Math.max(0, Math.min(pips, Math.round(filled)));
  const held = Math.max(0, Math.min(pips - used, Math.round(reserved)));
  return (
    <span
      className="mana-meter"
      role="img"
      aria-label={`${used} of ${pips} mana${held ? `, ${held} held back` : ''}`}
    >
      {Array.from({ length: pips }, (_, i) => (
        <i
          key={i}
          className={`mana-pip ${i < used ? 'is-spent' : i < used + held ? 'is-held' : ''}`}
        />
      ))}
    </span>
  );
}

export const PIECE_NAME: Record<PieceType, string> = {
  d: 'Dragon',
  a: 'Archbishop',
  p: 'Pawn',
  n: 'Knight',
  b: 'Bishop',
  r: 'Rook',
  q: 'Queen',
  k: 'King',
};

export const ENCH_NAME: Record<Enchantment, string> = {
  squire: 'Squire',
  taunt: 'Taunt',
  martyr: 'Martyr',
  outpost: 'Outpost',
  swift: 'Swift',
  herald: 'Herald',
  poison: 'Poison',
  immolation: 'Immolation',
};
