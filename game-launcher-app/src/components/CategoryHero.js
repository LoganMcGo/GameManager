import React from 'react';
import { useLibrary } from '../context/LibraryContext';

function CategoryHero({ featuredGame, isLoading = false, categoryName }) {
  const { addToLibrary, isInLibrary, toggleFavorite, isFavorited } = useLibrary();

  if (isLoading) {
    return (
      <section className="mb-8">
        <div className="h-80 bg-gray-800 rounded-2xl animate-pulse">
          <div className="flex h-full">
            <div className="w-[70%] bg-gray-700 rounded-l-2xl"></div>
            <div className="w-[30%] p-10 flex flex-col justify-center">
              <div className="h-6 bg-gray-700 rounded mb-3 w-1/2"></div>
              <div className="h-8 bg-gray-700 rounded mb-4 w-3/4"></div>
              <div className="h-4 bg-gray-700 rounded mb-2 w-full"></div>
              <div className="h-4 bg-gray-700 rounded mb-4 w-2/3"></div>
              <div className="h-10 bg-gray-700 rounded w-32"></div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (!featuredGame) {
    return null;
  }

  const gameInLibrary = isInLibrary(featuredGame.appId);
  const gameIsFavorited = isFavorited(featuredGame.appId);

  return (
    <section className="mb-8">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-white">Featured {categoryName} Game</h2>
      </div>

      <div className="relative h-80 bg-gray-800 rounded-2xl overflow-hidden group">
        {/* Main hero content */}
        <div className="flex h-full">
          {/* Game artwork - 70% */}
          <div className="w-[70%] relative overflow-hidden">
            {/* Blurred background with sharp foreground image for all images - same as home slideshow */}
            <>
              {/* Blurred background layer */}
              <img
                src={featuredGame.imageUrl || '/api/placeholder/800/400'}
                alt=""
                className="absolute inset-0 w-full h-full object-cover scale-110 blur-md transition-transform duration-700 group-hover:scale-125"
                style={{ filter: 'blur(8px) brightness(0.4)' }}
              />
              {/* Sharp foreground image using object-contain to show whole image */}
              <img
                src={featuredGame.imageUrl || '/api/placeholder/800/400'}
                alt={featuredGame.name}
                className="relative z-10 w-full h-full object-contain transition-transform duration-700 group-hover:scale-105"
              />
            </>
            {/* Gradient overlay for better text readability */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-gray-900 opacity-60 z-20"></div>
          </div>

          {/* Game details - 30% */}
          <div className="w-[30%] p-10 flex flex-col justify-center bg-gray-800">
            <div>
              <div className="text-sm text-blue-400 mb-2 font-medium">{categoryName} • Featured</div>
              <h3 className="text-2xl font-bold text-white mb-3 leading-tight">{featuredGame.name}</h3>
              
              {/* Genre tags */}
              {featuredGame.genres && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {featuredGame.genres.slice(0, 2).map((genre, index) => (
                    <span
                      key={index}
                      className="px-2 py-1 bg-blue-600 bg-opacity-20 text-blue-300 text-xs rounded-full"
                    >
                      {genre}
                    </span>
                  ))}
                </div>
              )}

              {/* Rating */}
              {featuredGame.rating && (
                <div className="flex items-center mb-3">
                  <div className="flex text-yellow-400 mr-2">
                    {[...Array(5)].map((_, i) => (
                      <svg
                        key={i}
                        className={`w-3 h-3 ${i < Math.round(featuredGame.rating / 20) ? 'fill-current' : 'text-gray-600'}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"></path>
                      </svg>
                    ))}
                  </div>
                  <span className="text-gray-400 text-xs">{Math.round(featuredGame.rating)}/100</span>
                </div>
              )}

              {/* Description */}
              <p className="text-gray-300 text-sm leading-relaxed line-clamp-3">
                {featuredGame.summary || featuredGame.description || "Discover this amazing game and add it to your library."}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default CategoryHero;
