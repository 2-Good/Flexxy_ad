import React from 'react';
import { motion } from 'motion/react';
import { SITE_CONFIG } from '../config/site';

interface AccessDeniedScreenProps {
  onRestart: () => void;
}

export const AccessDeniedScreen: React.FC<AccessDeniedScreenProps> = ({ onRestart }) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white text-black select-none px-6 cursor-default"
    >
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 1, ease: [0.16, 1, 0.3, 1] }}
        className="text-center space-y-3"
      >
        <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-black">
          You can&apos;t enter
        </h1>

        <p className="text-xs text-neutral-400 font-mono tracking-widest uppercase">
          Human verification declined · Access locked
        </p>

        <div className="pt-8">
          <button
            type="button"
            onClick={onRestart}
            className="group relative px-5 py-2.5 text-xs font-mono uppercase tracking-widest text-neutral-500 hover:text-black transition-colors cursor-pointer"
          >
            <span>Return to beginning</span>
            <span
              aria-hidden="true"
              className="absolute bottom-1 left-1/2 h-[1px] w-0 -translate-x-1/2 bg-black transition-all duration-300 group-hover:w-12"
            />
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
