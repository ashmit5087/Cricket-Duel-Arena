import { useMemo } from "react";
import DriftWall from "@/components/ui/DriftWall";

interface KingKohliGalleryProps {
  progress: number;
  images: string[];
}

export default function KingKohliGallery({
  progress,
  images,
}: KingKohliGalleryProps) {
  const animationForce = useMemo(() => {
    // We keep the easing if needed, but DriftWall also has its own damping
    return 1 - Math.pow(1 - progress, 3);
  }, [progress]);

  const driftWallItems = useMemo(() => {
    return images.map((img, i) => ({
      image: img,
      title: `Kohli ${i + 1}`,
      href: undefined
    }));
  }, [images]);

  return (
    <div className="fixed inset-0 bg-[#0a0a0a]">
      <DriftWall
        items={driftWallItems}
        isControlled={true}
        controlledProgress={animationForce}
        className="h-screen w-full"
        columns={5}
        tileWidth={250}
        tileHeight={165}
        gap={22}
        tilt={16}
        turn={-14}
        perspective={1200}
        depth={120}
        speed={42}
        direction="up"
        overlayColor="#0a0a0a"
      />
    </div>
  );
}
