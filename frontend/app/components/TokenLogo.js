export default function TokenLogo({ token, size = 20 }) {
  const src = token === 'USDC'
    ? '/assets/tokens/usdc.svg'
    : token === 'USDT'
    ? '/assets/tokens/usdt.svg'
    : null;

  if (!src) return null;

  return (
    <img
      src={src}
      alt={token}
      width={size}
      height={size}
      style={{ borderRadius: '50%', display: 'block', flexShrink: 0 }}
    />
  );
}
