import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useIgdb } from '../context/IgdbContext';

const SearchBar = ({ onGameSelect, isMainPage = false }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const { searchGames } = useIgdb();
  const searchRef = useRef(null);
  const dropdownRef = useRef(null);
  const timeoutRef = useRef(null);

  // Debounced search function
  const debouncedSearch = useCallback(async (searchQuery) => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setResults([]);
      setIsOpen(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await searchGames(searchQuery.trim(), 8);
      
      if (result.success) {
        setResults(result.games);
        setIsOpen(result.games.length > 0);
      } else {
        setError(result.error);
        setResults([]);
        setIsOpen(false);
      }
    } catch (err) {
      setError('Failed to search games');
      setResults([]);
      setIsOpen(false);
    } finally {
      setIsLoading(false);
    }
  }, [searchGames]);

  // Handle input change with debouncing
  const handleInputChange = (e) => {
    const value = e.target.value;
    setQuery(value);

    // Clear previous timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout for debounced search
    timeoutRef.current = setTimeout(() => {
      debouncedSearch(value);
    }, 300);
  };

  // Handle game selection
  const handleGameSelect = (game) => {
    setQuery('');
    setResults([]);
    setIsOpen(false);
    if (onGameSelect) {
      onGameSelect(game);
    }
  };



  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        searchRef.current && 
        !searchRef.current.contains(event.target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      setQuery('');
    }
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Simple search bar that's part of the page content
  return (
    <div className="w-full max-w-xl sm:max-w-2xl lg:max-w-3xl xl:max-w-4xl mx-auto mb-4 sm:mb-6 lg:mb-8 px-2 sm:px-4">
      {/* Search Input */}
      <div 
        ref={searchRef}
        className="relative"
      >
        <div className="relative">
          {/* Search container */}
          <div className="backdrop-blur-md bg-gray-900/80 border border-gray-600 rounded-lg sm:rounded-xl lg:rounded-2xl shadow-2xl">
            <div className="relative">
              {/* Search icon */}
              <div className="absolute inset-y-0 left-0 pl-3 sm:pl-4 lg:pl-6 flex items-center pointer-events-none">
                <svg 
                  className="h-4 w-4 sm:h-5 sm:w-5 text-gray-300" 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" 
                  />
                </svg>
              </div>
              
              {/* Input field */}
              <input
                type="text"
                value={query}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onFocus={() => query.length >= 2 && results.length > 0 && setIsOpen(true)}
                placeholder="Search for games..."
                className="w-full pl-10 sm:pl-12 lg:pl-14 pr-10 sm:pr-12 py-2.5 sm:py-3 lg:py-4 bg-transparent text-white placeholder-gray-300 border-0 focus:outline-none focus:ring-0 text-sm sm:text-base lg:text-lg font-medium"
                autoComplete="off"
              />
              
              {/* Loading indicator */}
              {isLoading && (
                <div className="absolute inset-y-0 right-0 pr-3 sm:pr-4 lg:pr-6 flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 sm:h-5 sm:w-5 border-t-2 border-b-2 border-blue-400"></div>
                </div>
              )}
              
              {/* Clear button */}
              {query && !isLoading && (
                <button
                  onClick={() => {
                    setQuery('');
                    setResults([]);
                    setIsOpen(false);
                  }}
                  className="absolute inset-y-0 right-0 pr-3 sm:pr-4 lg:pr-6 flex items-center text-gray-400 hover:text-white transition-colors"
                >
                  <svg className="h-4 w-4 sm:h-5 sm:w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Search Results Dropdown */}
          {isOpen && (
            <div
              ref={dropdownRef}
              className="absolute top-full left-0 right-0 mt-1 sm:mt-2 backdrop-blur-md bg-black/30 border border-white/20 rounded-lg sm:rounded-xl lg:rounded-2xl shadow-2xl max-h-80 sm:max-h-96 lg:max-h-[28rem] overflow-y-auto z-50"
            >
              {error ? (
                <div className="p-4 sm:p-6 text-center text-red-400 font-medium text-sm sm:text-base">
                  {error}
                </div>
              ) : results.length > 0 ? (
                <div className="py-1 sm:py-2">
                  {results.map((game, index) => (
                    <div
                      key={game.appId}
                      className="px-3 sm:px-4 py-2 sm:py-3 flex items-center space-x-2 sm:space-x-3 lg:space-x-4 hover:bg-white/10 transition-colors border-b border-white/5 last:border-b-0"
                    >
                      {/* Game Image */}
                      <div 
                        className="flex-shrink-0 w-8 h-12 sm:w-10 sm:h-14 lg:w-12 lg:h-16 bg-gray-700 rounded-md sm:rounded-lg overflow-hidden cursor-pointer"
                        onClick={() => handleGameSelect(game)}
                      >
                        {game.imageUrl ? (
                          <img
                            src={game.imageUrl}
                            alt={game.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.target.style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-gray-600 to-gray-800 flex items-center justify-center">
                            <svg className="w-3 h-3 sm:w-4 sm:h-4 lg:w-6 lg:h-6 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                            </svg>
                          </div>
                        )}
                      </div>
                      
                      {/* Game Info */}
                      <div 
                        className="flex-1 min-w-0 cursor-pointer"
                        onClick={() => handleGameSelect(game)}
                      >
                        <h3 className="text-white font-semibold text-xs sm:text-sm mb-0.5 sm:mb-1 truncate">
                          {game.name}
                        </h3>
                        <div className="flex items-center space-x-1 sm:space-x-2 text-xs text-gray-300 mb-0.5 sm:mb-1">
                          {game.releaseDate && (
                            <span className="text-xs sm:text-xs">{game.releaseDate}</span>
                          )}
                          {game.rating && (
                            <>
                              <span className="hidden sm:inline">•</span>
                              <span className="text-yellow-400 text-xs">★ {game.rating}</span>
                            </>
                          )}
                        </div>
                        <p className="text-gray-400 text-xs leading-relaxed line-clamp-2 hidden sm:block">
                          {game.description.length > 100 
                            ? game.description.substring(0, 100) + '...'
                            : game.description
                          }
                        </p>
                        <p className="text-gray-400 text-xs leading-relaxed line-clamp-1 sm:hidden">
                          {game.description.length > 50 
                            ? game.description.substring(0, 50) + '...'
                            : game.description
                          }
                        </p>
                      </div>

                      {/* View Details Button */}
                      <div className="flex-shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation(); // Prevent game selection from parent click
                            handleGameSelect(game);
                          }}
                          className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-2 rounded-md text-xs transition-colors duration-300 flex items-center space-x-1"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                          <span>View Details</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : query.length >= 2 && !isLoading ? (
                <div className="p-4 sm:p-6 text-center text-gray-400 font-medium text-sm sm:text-base">
                  No games found for "{query}"
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SearchBar; 