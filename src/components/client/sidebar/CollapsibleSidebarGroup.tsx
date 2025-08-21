import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { MenuItem } from './MenuItem';
import { SidebarSection } from './SidebarData';

interface CollapsibleSidebarGroupProps {
  section: SidebarSection;
  defaultExpanded?: boolean;
}

export function CollapsibleSidebarGroup({ section, defaultExpanded = true }: CollapsibleSidebarGroupProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className="space-y-2 mb-4">
      <button
        onClick={toggleExpanded}
        className="flex items-center justify-between w-full px-3 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider hover:text-gray-700 transition-colors"
        aria-expanded={isExpanded}
        aria-controls={`section-${section.id}`}
      >
        <span>{section.title}</span>
        {isExpanded ? (
          <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronRight className="w-3 h-3" />
        )}
      </button>
      
      <div 
        id={`section-${section.id}`}
        className={`overflow-hidden transition-all duration-200 ease-in-out ${
          isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="space-y-1 pt-1">
          {section.items.map((item) => (
            <MenuItem key={item.id} item={item} />
          ))}
        </div>
      </div>
    </div>
  );
}