import React from 'react';

const categories = [
  { id: 'action', name: 'Action', icon: '⚔️', color: 'from-red-600 to-red-800' },
  { id: 'rpg', name: 'RPG', icon: '🗡️', color: 'from-purple-600 to-purple-800' },
  { id: 'strategy', name: 'Strategy', icon: '♟️', color: 'from-blue-600 to-blue-800' },
  { id: 'indie', name: 'Indie', icon: '🎨', color: 'from-green-600 to-green-800' },
  { id: 'sports', name: 'Sports', icon: '⚽', color: 'from-orange-600 to-orange-800' },
  { id: 'racing', name: 'Racing', icon: '🏎️', color: 'from-yellow-600 to-yellow-800' },
  { id: 'simulation', name: 'Simulation', icon: '🏗️', color: 'from-teal-600 to-teal-800' },
  { id: 'adventure', name: 'Adventure', icon: '🗺️', color: 'from-indigo-600 to-indigo-800' }
];

function CategoryNavigation({ onCategorySelect, selectedCategory = null }) {
  return (
    <section className="mb-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-white mb-2">Browse by Category</h2>
        <p className="text-gray-400">Discover games by your favorite genres</p>
      </div>
      
      <div className="grid grid-cols-4 gap-4">
        {categories.map((category) => (
          <button
            key={category.id}
            onClick={() => onCategorySelect(category.id)}
            className={`
              relative overflow-hidden rounded-xl p-6 text-left transition-all duration-300 transform hover:scale-105 hover:shadow-xl
              bg-gradient-to-br ${category.color} hover:brightness-110
              ${selectedCategory === category.id ? 'ring-2 ring-white ring-opacity-50' : ''}
            `}
          >
            {/* Background pattern */}
            <div className="absolute inset-0 bg-black bg-opacity-20"></div>
            <div className="absolute top-0 right-0 w-20 h-20 bg-white bg-opacity-10 rounded-full -translate-y-10 translate-x-10"></div>
            
            {/* Content */}
            <div className="relative z-10">
              <div className="text-3xl mb-2">{category.icon}</div>
              <h3 className="text-white font-semibold text-lg">{category.name}</h3>
            </div>
            
            {/* Hover effect */}
            <div className="absolute inset-0 bg-white bg-opacity-0 hover:bg-opacity-10 transition-all duration-300"></div>
          </button>
        ))}
      </div>
    </section>
  );
}

export default CategoryNavigation;
