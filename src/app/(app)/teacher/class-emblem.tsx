import Image from 'next/image';
import { School } from 'lucide-react';

export function ClassEmblem({ classId, name, emblemPath, size = 'list' }: {
  classId: string;
  name: string;
  emblemPath: string | null;
  size?: 'list' | 'overview';
}) {
  const dimensions = size === 'overview' ? 80 : 48;
  const frameClass = size === 'overview' ? 'size-20 rounded-lg' : 'size-12 rounded-md';

  return emblemPath ? <span className={`relative grid shrink-0 place-items-center overflow-hidden border border-workspace-line bg-white shadow-sm ${frameClass}`}>
    <Image unoptimized width={dimensions} height={dimensions} alt={`${name}班徽`}
      src={`/api/classes/${classId}/emblem?v=${encodeURIComponent(emblemPath)}`} className="size-full object-contain p-1.5" />
  </span> : <span role="img" aria-label={`${name}班徽尚未设置`}
    className={`grid shrink-0 place-items-center border border-dashed border-workspace-accent/30 bg-workspace-accent-soft text-workspace-accent-strong ${frameClass}`}>
    <School aria-hidden="true" className={size === 'overview' ? 'size-7' : 'size-5'} />
  </span>;
}
