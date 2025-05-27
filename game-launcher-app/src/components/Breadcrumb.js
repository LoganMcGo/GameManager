import React from 'react';

function Breadcrumb({ items, onNavigate }) {
  return (
    <nav className="flex items-center space-x-2 text-sm text-gray-400 mb-6">
      {items.map((item, index) => (
        <React.Fragment key={index}>
          {index > 0 && (
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path>
            </svg>
          )}
          <button
            onClick={() => onNavigate && onNavigate(item.path)}
            className={`hover:text-white transition-colors ${
              index === items.length - 1 ? 'text-white font-medium' : 'hover:underline'
            }`}
            disabled={index === items.length - 1}
          >
            {item.label}
          </button>
        </React.Fragment>
      ))}
    </nav>
  );
}

export default Breadcrumb;
