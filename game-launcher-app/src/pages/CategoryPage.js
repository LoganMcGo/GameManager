import React, { useState, useEffect } from 'react';
import { useIgdb } from '../context/IgdbContext';
import { useLibrary } from '../context/LibraryContext';
import Breadcrumb from '../components/Breadcrumb';
import CategoryHero from '../components/CategoryHero';
import SubCategoryFilter from '../components/SubCategoryFilter';
import GameCard from '../components/GameCard';
import GameDetailView from '../components/GameDetailView';
import SkeletonCard from '../components/SkeletonCard';
import SearchBar from '../components/SearchBar';

const categoryNames = {
  action: 'Action',
  rpg: 'RPG',
  strategy: 'Strategy',
  indie: 'Indie',
  sports: 'Sports',
  racing: 'Racing',
  simulation: 'Simulation',
  adventure: 'Adventure'
};

// Universal sub-categories that work for all genres
const universalSubCategories = [
  { id: 'all', name: 'All Games' },
  { id: 'popular', name: 'Popular' },
  { id: 'new', name: 'New Releases' },
  { id: 'classics', name: 'Classics' },
  { id: 'high-rated', name: 'High Rated' }
];

function CategoryPage({ category, onNavigate, onGameSelect }) {
  const { 
    clientId,
    accessToken,
    isLoadingGames,
    error, 
    fetchGamesByGenre,
    fetchGameDetails
  } = useIgdb();
  
  const { addToRecentlyViewed } = useLibrary();
  
  const [selectedGame, setSelectedGame] = useState(null);
  const [gameDetails, setGameDetails] = useState(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [selectedSubCategory, setSelectedSubCategory] = useState('all');
  const [categoryGames, setCategoryGames] = useState([]);
  const [featuredGame, setFeaturedGame] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoadingCategoryGames, setIsLoadingCategoryGames] = useState(false);
  const [totalGames, setTotalGames] = useState(0);
  const gamesPerPage = 20;

  const categoryName = categoryNames[category] || 'Games';
  
  // Calculate total pages
  const totalPages = Math.ceil(totalGames / gamesPerPage);

  // Breadcrumb items
  const breadcrumbItems = [
    { label: 'Home', path: 'home' },
    { label: categoryName, path: `category/${category}` }
  ];

  // Fetch games when component mounts, category changes, page changes, or sub-category changes
  useEffect(() => {
    if (clientId && accessToken && category) {
      fetchCategoryGamesPage(currentPage);
    }
  }, [clientId, accessToken, category, currentPage, selectedSubCategory]);

  // Reset to page 1 when category or sub-category changes
  useEffect(() => {
    setCurrentPage(1);
    setCategoryGames([]);
    setFeaturedGame(null);
    setTotalGames(0);
  }, [category, selectedSubCategory]);

  // Function to fetch category-specific games for a specific page
  const fetchCategoryGamesPage = async (page) => {
    setIsLoadingCategoryGames(true);
    try {
      const offset = (page - 1) * gamesPerPage;
      
      // Use the electron IPC API call with pagination and sub-category filtering
      const result = await window.api.igdb.getGamesByGenre(category, gamesPerPage, offset, selectedSubCategory);
      
      if (result.games) {
        setCategoryGames(result.games);
        
        // Set featured game from first page
        if (page === 1 && result.games.length > 0) {
          setFeaturedGame(result.games[0]);
        }
        
        // Be optimistic about total games - assume we can get at least 30 pages for categories
        // Adjust estimate based on sub-category (sub-categories typically have fewer games)
        const baseEstimate = selectedSubCategory === 'all' ? 30 * gamesPerPage : 15 * gamesPerPage;
        const currentEstimate = page * gamesPerPage + (result.games.length === gamesPerPage ? gamesPerPage * 3 : 0);
        setTotalGames(Math.max(totalGames, baseEstimate, currentEstimate));
      } else if (result.error) {
        console.error(`Error fetching ${category} games:`, result.error);
      }
    } catch (error) {
      console.error(`Error fetching ${category} games:`, error);
    } finally {
      setIsLoadingCategoryGames(false);
    }
  };

  // Handle page navigation
  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages && newPage !== currentPage) {
      setCurrentPage(newPage);
      // Scroll to top when changing pages
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Handle game selection for detail view
  const handleGameSelect = async (game) => {
    setSelectedGame(game);
    setGameDetails(null);
    setIsLoadingDetails(true);
    
    // Add to recently viewed
    addToRecentlyViewed(game);
    
    try {
      const { success, gameDetails: details } = await fetchGameDetails(game.appId);
      if (success) {
        setGameDetails(details);
      } else {
        setGameDetails(game);
      }
    } catch (error) {
      console.error('Error fetching game details:', error);
      setGameDetails(game);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  // Close the game detail view
  const handleCloseDetail = () => {
    setSelectedGame(null);
    setGameDetails(null);
    setIsLoadingDetails(false);
  };

  // Handle sub-category selection
  const handleSubCategorySelect = (subCategoryId) => {
    setSelectedSubCategory(subCategoryId);
    // Reset pagination and games will be refetched due to useEffect dependency
  };

  // Since we're doing server-side filtering, we use all category games
  const filteredGames = categoryGames;

  // Generate page numbers for pagination
  const getPageNumbers = () => {
    const pages = [];
    const maxVisiblePages = 5;
    
    if (totalPages <= maxVisiblePages) {
      // Show all pages if total is small
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Show current page and surrounding pages
      const start = Math.max(1, currentPage - 2);
      const end = Math.min(totalPages, currentPage + 2);
      
      if (start > 1) {
        pages.push(1);
        if (start > 2) pages.push('...');
      }
      
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      
      if (end < totalPages) {
        if (end < totalPages - 1) pages.push('...');
        pages.push(totalPages);
      }
    }
    
    return pages;
  };

  return (
    <div className="flex-1 overflow-y-auto bg-gray-900 text-white main-container">
      {/* Search Bar */}
      <SearchBar onGameSelect={onGameSelect} />
      
      {/* IGDB Credentials Not Configured Message */}
      {(!clientId || !accessToken) && (
        <div className="bg-yellow-800 text-yellow-100 p-4 rounded-lg mb-4 sm:mb-6 lg:mb-8">
          <h3 className="font-bold mb-2 responsive-text">IGDB Credentials Not Configured</h3>
          <p className="mb-2 text-sm sm:text-base">To display real game data, please configure your IGDB Client ID and Client Secret in the settings.</p>
          <button 
            className="bg-yellow-700 hover:bg-yellow-600 text-white px-3 py-2 sm:px-4 sm:py-2 rounded text-sm"
            onClick={() => onNavigate('settings')}
          >
            Go to Settings
          </button>
        </div>
      )}
      
      {/* Error Message */}
      {error && (
        <div className="bg-red-800 text-red-100 p-4 rounded-lg mb-4 sm:mb-6 lg:mb-8">
          <h3 className="font-bold mb-2 responsive-text">Error</h3>
          <p className="text-sm sm:text-base">{error}</p>
        </div>
      )}

      {/* Breadcrumb */}
      <Breadcrumb items={breadcrumbItems} onNavigate={onNavigate} />

      {/* Category Header */}
      <div className="mb-4 sm:mb-6 lg:mb-8">
        <h1 className="responsive-heading font-bold text-white mb-2">{categoryName} Games</h1>
        <p className="text-gray-400 responsive-text">Discover the best {categoryName.toLowerCase()} games</p>
      </div>

      {/* Category Hero */}
      <CategoryHero 
        featuredGame={featuredGame}
        isLoading={isLoadingCategoryGames && currentPage === 1}
        categoryName={categoryName}
      />

      {/* Sub-Category Filter */}
      <SubCategoryFilter 
        category={category}
        selectedSubCategory={selectedSubCategory}
        onSubCategorySelect={handleSubCategorySelect}
      />

      {/* Games Grid Section */}
      <section className="mb-4 sm:mb-6 lg:mb-8">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 sm:mb-6 space-y-2 sm:space-y-0">
          <div>
            <h2 className="responsive-subheading font-bold text-white mb-2">
              {selectedSubCategory === 'all' 
                ? `All ${categoryName} Games` 
                : `${universalSubCategories.find(sub => sub.id === selectedSubCategory)?.name || selectedSubCategory} Games`
              }
            </h2>
            <p className="text-gray-400 text-sm sm:text-base">
              {totalGames > 0 && (
                <span>
                  Page {currentPage} of {totalPages} - {totalGames}+ games
                  {selectedSubCategory !== 'all' && (
                    <span className="ml-2 text-blue-400">
                      (filtered by sub-category)
                    </span>
                  )}
                </span>
              )}
              {isLoadingCategoryGames && selectedSubCategory !== 'all' && (
                <span className="text-blue-400">Loading filtered results...</span>
              )}
              {isLoadingCategoryGames && selectedSubCategory === 'all' && (
                <span className="text-blue-400">Loading games...</span>
              )}
            </p>
          </div>
        </div>
        
        {/* Loading skeleton cards */}
        {isLoadingCategoryGames && (
          <div className="game-grid mb-4 sm:mb-6 lg:mb-8">
            {Array.from({ length: gamesPerPage }).map((_, index) => (
              <SkeletonCard key={index} size="medium" />
            ))}
          </div>
        )}
        
        {/* No games message */}
        {!isLoadingCategoryGames && filteredGames.length === 0 && clientId && accessToken && (
          <div className="bg-gray-800 rounded-lg p-6 sm:p-8 text-center mb-4 sm:mb-6 lg:mb-8">
            <p className="text-gray-400 responsive-text">No games found in this category.</p>
          </div>
        )}
        
        {/* Games grid */}
        {!isLoadingCategoryGames && filteredGames.length > 0 && (
          <>
            <div className="game-grid mb-4 sm:mb-6 lg:mb-8">
              {filteredGames.map(game => (
                <GameCard 
                  key={game.appId} 
                  game={game} 
                  size="medium" 
                  onClick={handleGameSelect}
                />
              ))}
            </div>
            
            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center space-x-1 sm:space-x-2 py-4 sm:py-6 lg:py-8">
                {/* Previous Button */}
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className={`px-2 py-1 sm:px-4 sm:py-2 rounded-lg font-medium transition-colors text-sm sm:text-base ${
                    currentPage === 1
                      ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  <span className="hidden sm:inline">Previous</span>
                  <span className="sm:hidden">Prev</span>
                </button>
                
                {/* Page Numbers */}
                {getPageNumbers().map((page, index) => (
                  <button
                    key={index}
                    onClick={() => typeof page === 'number' ? handlePageChange(page) : null}
                    disabled={page === '...'}
                    className={`px-2 py-1 sm:px-4 sm:py-2 rounded-lg font-medium transition-colors text-sm sm:text-base ${
                      page === currentPage
                        ? 'bg-blue-600 text-white'
                        : page === '...'
                        ? 'bg-transparent text-gray-500 cursor-default'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    {page}
                  </button>
                ))}
                
                {/* Next Button */}
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className={`px-2 py-1 sm:px-4 sm:py-2 rounded-lg font-medium transition-colors text-sm sm:text-base ${
                    currentPage === totalPages
                      ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  <span className="hidden sm:inline">Next</span>
                  <span className="sm:hidden">Next</span>
                </button>
              </div>
            )}
          </>
        )}
      </section>
      
      {/* Game Detail View */}
      {selectedGame && (
        <GameDetailView 
          game={gameDetails || selectedGame}
          isLoading={isLoadingDetails}
          onClose={handleCloseDetail} 
        />
      )}
    </div>
  );
}

export default CategoryPage;
