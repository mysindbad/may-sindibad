export function BrandMark({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- small inline brand mark, not a content image subject to the remote-loader domain list.
  return <img src="/icons/my-sindbad-192.png" alt="" className={className} />;
}
