import React from 'react';

// Universal sub-categories that work for all genres
const universalSubCategories = [
  { id: 'all', name: 'All Games' },
  { id: 'popular', name: 'Popular' },
  { id: 'new', name: 'New Releases' },
  { id: 'classics', name: 'Classics' },
  { id: 'high-rated', name: 'High Rated' }
];

function SubCategoryFilter({ category, selectedSubCategory, onSubCategorySelect }) {
  // Use universal categories for all genres
  const subCategories = universalSubCategories;

  return (
    <div className="mb-8">
      <div className="flex flex-wrap gap-3">
        {subCategories.map((subCategory) => (
          <button
            key={subCategory.id}
            onClick={() => onSubCategorySelect(subCategory.id)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
              selectedSubCategory === subCategory.id
                ? 'bg-blue-600 text-white shadow-lg'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white'
            }`}
          >
            {subCategory.name}
          </button>
        ))}
      </div>
    </div>
  );
}

export default SubCategoryFilter;
