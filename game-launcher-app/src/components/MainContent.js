import React, { useState, useEffect } from 'react';
import { useIgdb } from '../context/IgdbContext';
import { useLibrary } from '../context/LibraryContext';
import GameCard from './GameCard';
import GameDetailView from './GameDetailView';
import SkeletonCard from './SkeletonCard';
import CategoryNavigation from './CategoryNavigation';
import FeaturedGamesSlideshow from './FeaturedGamesSlideshow';
import SearchBar from './SearchBar';

function MainContent(props) {
  const { 
    clientId,
    accessToken,
    isLoading, 
    error, 
    fetchFeaturedGames,
    fetchGameDetails
  } = useIgdb();
  
  const { addToRecentlyViewed } = useLibrary();
  
  // Get the navigation function and onGameSelect from props
  const { onNavigate, onGameSelect } = props;
  
  const [selectedGame, setSelectedGame] = useState(null);
  const [gameDetails, setGameDetails] = useState(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [featuredGames, setFeaturedGames] = useState([]);
  const [isLoadingFeatured, setIsLoadingFeatured] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [gamesPerPage] = useState(25); // Increased to 25 for 5x5 grid
  const [popularGames, setPopularGames] = useState([]);
  const [isLoadingGames, setIsLoadingGames] = useState(false);
  const [totalGames, setTotalGames] = useState(0);
  
  // Calculate total pages
  const totalPages = Math.ceil(totalGames / gamesPerPage);
  
  // Fetch games when the component mounts or page changes
  useEffect(() => {
    fetchPopularGamesPage(currentPage);
    if (currentPage === 1) {
      fetchFeaturedGamesData();
    }
  }, [currentPage]);
  
  // Function to fetch popular games for a specific page
  const fetchPopularGamesPage = async (page) => {
    setIsLoadingGames(true);
    try {
      const offset = (page - 1) * gamesPerPage;
      
      // Use the correct electron IPC API call
      const result = await window.api.igdb.getPopularNewGames(gamesPerPage, offset);
      
      if (result.games) {
        setPopularGames(result.games);
        // Be more optimistic about total games - assume we can get at least 50 pages (1250 games)
        // and expand the estimate as we fetch more pages successfully
        const minEstimatedGames = 50 * gamesPerPage; // At least 1250 games
        const currentEstimate = page * gamesPerPage + (result.games.length === gamesPerPage ? gamesPerPage * 5 : 0);
        setTotalGames(Math.max(totalGames, minEstimatedGames, currentEstimate));
      } else if (result.error) {
        console.error('Error fetching popular games:', result.error);
      }
    } catch (error) {
      console.error('Error fetching popular games:', error);
    } finally {
      setIsLoadingGames(false);
    }
  };
  
  // Function to fetch featured games
  const fetchFeaturedGamesData = async () => {
    setIsLoadingFeatured(true);
    try {
      const { success, games } = await fetchFeaturedGames(5);
      if (success) {
        setFeaturedGames(games);
      }
    } catch (error) {
      console.error('Error fetching featured games:', error);
    } finally {
      setIsLoadingFeatured(false);
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
        // Fallback to basic game info if detailed fetch fails
        setGameDetails(game);
      }
    } catch (error) {
      console.error('Error fetching game details:', error);
      // Fallback to basic game info
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
  
  // Handle category selection
  const handleCategorySelect = (categoryId) => {
    onNavigate(`category/${categoryId}`);
  };

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
    <div className="flex-1 overflow-y-auto main-scroll-container bg-gray-900 text-white main-container">
      {/* Search Bar */}
      <SearchBar onGameSelect={onGameSelect} />
      
      {/* Category Navigation */}
      <CategoryNavigation onCategorySelect={handleCategorySelect} />
      
      {/* Featured Games Slideshow */}
      <FeaturedGamesSlideshow 
        featuredGames={featuredGames} 
        isLoading={isLoadingFeatured}
        onGameSelect={handleGameSelect}
      />
      
      {/* Popular Games Grid with Pagination */}
      <section className="mb-4 sm:mb-6 lg:mb-8">
        <div className="mb-4 sm:mb-6">
          <h2 className="responsive-heading font-bold text-white mb-2">Popular Games</h2>
          <p className="text-gray-400 responsive-text">
            Trending games everyone's playing
            {totalGames > 0 && (
              <span className="ml-2 text-xs sm:text-sm">
                (Page {currentPage} of {totalPages} - {totalGames}+ games)
              </span>
            )}
          </p>
        </div>
        
        {/* Loading skeleton cards */}
        {isLoadingGames && (
          <div className="game-grid mb-4 sm:mb-6 lg:mb-8">
            {Array.from({ length: gamesPerPage }).map((_, index) => (
              <SkeletonCard key={index} size="medium" />
            ))}
          </div>
        )}
        
        {/* No games message */}
        {!isLoadingGames && popularGames.length === 0 && (
          <div className="bg-gray-800 rounded-lg p-6 sm:p-8 text-center mb-4 sm:mb-6 lg:mb-8">
            <p className="text-gray-400 responsive-text">No games found. Try refreshing the page.</p>
          </div>
        )}
        
        {/* Games grid */}
        {!isLoadingGames && popularGames.length > 0 && (
          <>
            <div className="game-grid mb-4 sm:mb-6 lg:mb-8">
              {popularGames.map(game => (
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

export default MainContent;
