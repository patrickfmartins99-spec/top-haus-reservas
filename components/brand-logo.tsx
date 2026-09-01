import Image from 'next/image';

import { cn } from '@/lib/utils';

type BrandLogoProps = {
  className?: string;
  priority?: boolean;
  compact?: boolean;
};

export function BrandLogo({ className, priority = false, compact = false }: BrandLogoProps) {
  return (
    <span
      className={cn(
        'relative block overflow-hidden bg-black',
        compact ? 'h-10 w-[72px]' : 'h-14 w-[100px]',
        className,
      )}
    >
      <Image
        src="/logo-tophaus.jpg"
        alt="Top Haus"
        fill
        priority={priority}
        sizes={compact ? '72px' : '100px'}
        className="object-contain"
      />
    </span>
  );
}
