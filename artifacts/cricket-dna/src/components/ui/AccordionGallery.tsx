import { useState } from 'react';
import { motion } from 'framer-motion';

export default function AccordionGallery({
  items = [],
  defaultIndex = 0,
  expandRatio = 0.52,
  trigger = 'hover'
}: any) {
  const [activeIndex, setActiveIndex] = useState(defaultIndex);

  return (
    <div className="flex w-full h-[600px] overflow-hidden rounded-2xl gap-2">
      {items.map((item: any, index: number) => {
        const isActive = activeIndex === index;

        return (
          <motion.div
            key={index}
            className="relative h-full overflow-hidden rounded-xl cursor-pointer"
            animate={{ flex: isActive ? expandRatio * 10 : 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 25 }}
            onMouseEnter={() => trigger === 'hover' && setActiveIndex(index)}
            onClick={() => trigger === 'click' && setActiveIndex(index)}
          >
            <img 
              src={item.image} 
              alt={item.label} 
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-out hover:scale-110" 
            />
            {/* Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
            
            {/* Text Content */}
            <motion.div 
              className="absolute bottom-6 left-6"
              animate={{ opacity: isActive ? 1 : 0, y: isActive ? 0 : 20 }}
              transition={{ duration: 0.3, delay: isActive ? 0.2 : 0 }}
            >
              <h2 className="text-3xl font-bold text-white tracking-wider" style={{ fontFamily: "'Bebas Neue', sans-serif", textShadow: "0 2px 10px rgba(0,0,0,0.5)" }}>
                {item.label}
              </h2>
            </motion.div>
          </motion.div>
        );
      })}
    </div>
  );
}
