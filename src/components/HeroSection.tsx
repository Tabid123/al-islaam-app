import React from 'react';
import alIslaamLogo from '@/assets/al-islaam-logo.jpg';

const HeroSection = () => {
  return (
    <div className="text-center space-y-5 pt-4">
      <div className="w-36 h-36 mx-auto rounded-[2rem] overflow-hidden shadow-xl shadow-primary/20">
        <img 
          src={alIslaamLogo} 
          alt="Al-islaam Data"
          className="w-full h-full object-cover"
        />
      </div>
      
      <div className="space-y-1">
        <h1 className="text-4xl font-black tracking-tight text-primary leading-none">
          AL-ISLAAM
        </h1>
        <p className="text-accent font-bold text-lg tracking-[0.3em] uppercase">Data</p>
      </div>
      
      <div className="flex items-center gap-3 justify-center">
        <span className="h-px w-10 bg-border" />
        <p className="text-base text-muted-foreground font-medium">
          Internet aad ku kalsoon tahay
        </p>
        <span className="h-px w-10 bg-border" />
      </div>
    </div>
  );
};

export default HeroSection;
