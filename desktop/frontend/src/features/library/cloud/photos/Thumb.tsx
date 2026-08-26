import { useState } from "react";

// 缩略图：加载完成前保持透明，避免滚动时图片"闪现"；
// ref 回调兜底缓存命中场景（complete 已为 true 时 onLoad 不会再触发）
export function Thumb({
  src,
  alt,
  className,
  width,
  height,
}: {
  src: string;
  alt: string;
  className: string;
  width?: number;
  height?: number;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <img
      src={src}
      alt={alt}
      width={width || undefined}
      height={height || undefined}
      loading="lazy"
      decoding="async"
      draggable={false}
      ref={(el) => {
        if (el?.complete && el.naturalWidth > 0) setLoaded(true);
      }}
      onLoad={() => setLoaded(true)}
      className={`${className} ${loaded ? "opacity-100" : "opacity-0"}`}
    />
  );
}
