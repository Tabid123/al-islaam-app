import React from 'react';

interface ProviderCardProps {
  name: string;
  logo: string;
  onClick: () => void;
  disabled?: boolean;
}

const PROVIDER_COLORS: Record<string, string> = {
  hormuud: '142 72% 40%',
  somnet: '205 64% 53%',
  somtel: '47 95% 53%',
  amtel: '0 78% 55%',
  somlink: '276 55% 47%',
};

const getProviderColor = (name: string): string => {
  const key = name.toLowerCase().trim();

  for (const [provider, color] of Object.entries(PROVIDER_COLORS)) {
    if (key.includes(provider)) return color;
  }

  return '281 100% 20%';
};

const ProviderCard = ({ name, logo, onClick, disabled = false }: ProviderCardProps) => {
  const providerColor = getProviderColor(name);

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`group relative w-full rounded-xl bg-card border-2 p-2 flex flex-col items-center justify-between transition-all duration-200 ${
        !disabled
          ? 'hover:shadow-md active:scale-[0.97]'
          : 'opacity-50 cursor-not-allowed'
      }`}
      style={disabled ? { minHeight: '96px' } : {
        borderColor: `hsl(${providerColor})`,
        minHeight: '96px',
      }}
    >
      <div className="flex-1 w-full flex items-center justify-center">
        <img
          src={logo}
          alt={`${name} logo`}
          className="max-h-10 max-w-[65%] object-contain"
          loading="eager"
          decoding="async"
        />
      </div>
      <span className="text-[13px] font-medium text-foreground pb-0.5">{name}</span>
    </button>
  );
};

export default ProviderCard;