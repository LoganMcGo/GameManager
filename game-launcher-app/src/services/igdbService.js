const Store = require('electron-store').default || require('electron-store');
const { ipcMain } = require('electron');
const { makeProxyRequest } = require('./jwtService');

// Cloud function URLs
const IGDB_PROXY_URL = 'https://us-central1-gamemanagerproxy.cloudfunctions.net/igdb-proxy';

// Declare store variables
let cacheStore;

// Cache configuration (in milliseconds)
const CACHE_DURATION = {
  featuredGames: 60 * 60 * 1000, // 1 hour
  popularGames: 10 * 60 * 1000,  // 10 minutes (reduced for faster updates)
  gameDetails: 2 * 60 * 60 * 1000, // 2 hours
  gamesByGenre: 1 * 60 * 1000    // 1 minute (very short for testing new filters)
};

// Helper function to format IGDB image URLs
function formatImageUrl(url, size = 't_cover_big') {
  if (!url) return null;
  
  // Handle URLs that start with //
  if (url.startsWith('//')) {
    url = 'https:' + url;
  }
  
  // Handle URLs that don't have protocol
  if (!url.startsWith('http')) {
    url = 'https://' + url;
  }
  
  // Replace the size parameter
  return url.replace(/t_thumb|t_cover_small|t_cover_big|t_screenshot_med|t_screenshot_big/g, size);
}

// IGDB Genre ID mapping
const GENRE_IDS = {
  action: 4,
  rpg: 12,
  strategy: 11,
  indie: 32,
  sports: 14,
  racing: 10,
  simulation: 13,
  adventure: 31
};

// Universal sub-category filtering (works for all genres)
const UNIVERSAL_SUB_CATEGORIES = [
  { id: 'all', name: 'All Games' },
  { id: 'popular', name: 'Popular' },
  { id: 'new', name: 'New Releases' },
  { id: 'classics', name: 'Classics' },
  { id: 'high-rated', name: 'High Rated' }
];

// PC Platform IDs in IGDB (Windows, Mac, Linux)
const PC_PLATFORM_IDS = [6, 14, 3]; // 6 = PC (Microsoft Windows), 14 = Mac, 3 = Linux

// Initialize the service
function initIgdbService() {
  try {
    // Create a separate store for caching
    cacheStore = new Store({
      name: 'igdb-cache',
      encryptionKey: 'your-cache-encryption-key',
    });

    // Register IPC handlers for renderer process to communicate with this service
    ipcMain.handle('igdb:get-popular-new-games', (event, limit, offset) => handleGetPopularNewGames(limit, offset));
    ipcMain.handle('igdb:get-games-by-genre', (event, genre, limit, offset, subCategory) => handleGetGamesByGenre(genre, limit, offset, subCategory));
    ipcMain.handle('igdb:get-featured-games', (event, limit) => handleGetFeaturedGames(limit));
    ipcMain.handle('igdb:get-game-details', (event, gameId) => handleGetGameDetails(gameId));
    ipcMain.handle('igdb:search-games', (event, query, limit) => handleSearchGames(query, limit));
    ipcMain.handle('igdb:clear-cache', clearCache);
    
    // Legacy credential handlers (for backward compatibility with UI)
    ipcMain.handle('igdb:get-credentials', () => ({ 
      clientId: 'cloud-proxy', 
      clientSecret: 'cloud-proxy', 
      accessToken: 'cloud-proxy' 
    }));
    ipcMain.handle('igdb:set-credentials', () => ({ success: true, message: 'Using cloud proxy - credentials not needed' }));
    ipcMain.handle('igdb:test-credentials', () => ({ success: true, message: 'Using cloud proxy - credentials not needed' }));
    
    console.log('IGDB service initialized with proxy integration');
  } catch (error) {
    console.warn('Failed to initialize IGDB service:', error.message);
  }
}

// Clear cache function
function clearCache() {
  try {
    if (cacheStore) {
      cacheStore.clear();
      console.log('IGDB cache cleared');
      return { success: true };
    }
    return { success: false, error: 'Cache store not initialized' };
  } catch (error) {
    console.error('Failed to clear cache:', error.message);
    return { success: false, error: error.message };
  }
}

// Cache management functions
function getCacheKey(type, params = {}) {
  const paramString = Object.keys(params).sort().map(key => `${key}:${params[key]}`).join('|');
  return `${type}${paramString ? `_${paramString}` : ''}`;
}

function getCachedData(cacheKey, maxAge) {
  if (!cacheStore) return null;
  
  try {
    const cached = cacheStore.get(cacheKey);
    if (!cached) return null;
    
    const age = Date.now() - cached.timestamp;
    if (age > maxAge) {
      cacheStore.delete(cacheKey);
      return null;
    }
    
    return cached.data;
  } catch (error) {
    console.warn('Failed to get cached data:', error.message);
    return null;
  }
}

function setCachedData(cacheKey, data) {
  if (!cacheStore) return;
  
  try {
    cacheStore.set(cacheKey, {
      data,
      timestamp: Date.now()
    });
  } catch (error) {
    console.warn('Failed to cache data:', error.message);
  }
}

// Make API request through the IGDB proxy
async function makeApiRequest(endpoint, query) {
  try {
    console.log(`Making IGDB proxy request to ${endpoint}`);
    
    // Send the request directly to the proxy function without appending endpoint to URL
    // The endpoint information will be included in the request body or handled by the proxy
    const response = await makeProxyRequest(IGDB_PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      data: {
        endpoint: endpoint,
        query: query
      }
    });
    
    return response;
  } catch (error) {
    console.error('IGDB proxy request failed:', error);
    
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      
      switch (status) {
        case 401:
          throw new Error('Authentication failed. Please restart the application.');
        case 429:
          throw new Error('Rate limit exceeded. Please wait a moment and try again.');
        case 500:
          throw new Error('IGDB service temporarily unavailable. Please try again later.');
        default:
          throw new Error(`IGDB service error: ${data?.error || 'Unknown error'}`);
      }
    }
    
    if (error.code === 'ECONNABORTED') {
      throw new Error('Request timeout. Please check your internet connection.');
    }
    
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      throw new Error('Cannot connect to IGDB service. Please check your internet connection.');
    }
    
    throw new Error(`Failed to fetch data from IGDB: ${error.message}`);
  }
}

// Handler for getting popular new games with error handling and caching
async function handleGetPopularNewGames(limit = 20, offset = 0) {
  try {
    const cacheKey = getCacheKey('popularGames', { limit, offset });
    
    // Try to get from cache first
    const cachedData = getCachedData(cacheKey, CACHE_DURATION.popularGames);
    if (cachedData) {
      console.log('Returning cached popular games');
      return { ...cachedData, fromCache: true };
    }

    const result = await getPopularNewGames(limit, offset);
    
    // Cache the result
    setCachedData(cacheKey, result);
    
    return result;
  } catch (error) {
    console.warn('IGDB API call failed:', error.message);
    
    // Try to return cached data even if expired as fallback
    const cacheKey = getCacheKey('popularGames', { limit, offset });
    const fallbackData = cacheStore ? cacheStore.get(cacheKey) : null;
    
    if (fallbackData) {
      console.log('Returning expired cached data as fallback');
      return { 
        ...fallbackData.data, 
        fromCache: true, 
        expired: true,
        error: `Using cached data due to API error: ${error.message}`
      };
    }
    
    return { 
      games: [], 
      error: error.message
    };
  }
}

// Handler for getting games by genre with error handling and caching
async function handleGetGamesByGenre(genre, limit = 20, offset = 0, subCategory = null) {
  try {
    const cacheKey = getCacheKey('gamesByGenre', { genre, limit, offset, subCategory });
    
    // Try to get from cache first
    const cachedData = getCachedData(cacheKey, CACHE_DURATION.gamesByGenre);
    if (cachedData) {
      console.log(`Returning cached ${genre} games`);
      return { ...cachedData, fromCache: true };
    }

    const result = await getGamesByGenre(genre, limit, offset, subCategory);
    
    // Cache the result
    setCachedData(cacheKey, result);
    
    return result;
  } catch (error) {
    console.warn('IGDB API call failed:', error.message);
    
    // Try to return cached data even if expired as fallback
    const cacheKey = getCacheKey('gamesByGenre', { genre, limit, offset, subCategory });
    const fallbackData = cacheStore ? cacheStore.get(cacheKey) : null;
    
    if (fallbackData) {
      console.log('Returning expired cached data as fallback');
      return { 
        ...fallbackData.data, 
        fromCache: true, 
        expired: true,
        error: `Using cached data due to API error: ${error.message}`
      };
    }
    
    return { 
      games: [], 
      error: error.message
    };
  }
}

// Handler for getting featured games with error handling and caching
async function handleGetFeaturedGames(limit = 5) {
  try {
    const cacheKey = getCacheKey('featuredGames', { limit });
    
    // Try to get from cache first
    const cachedData = getCachedData(cacheKey, CACHE_DURATION.featuredGames);
    if (cachedData) {
      console.log('Returning cached featured games');
      return { ...cachedData, fromCache: true };
    }

    const result = await getFeaturedGames(limit);
    
    // Cache the result
    setCachedData(cacheKey, result);
    
    return result;
  } catch (error) {
    console.warn('IGDB API call failed:', error.message);
    
    // Try to return cached data even if expired as fallback
    const cacheKey = getCacheKey('featuredGames', { limit });
    const fallbackData = cacheStore ? cacheStore.get(cacheKey) : null;
    
    if (fallbackData) {
      console.log('Returning expired cached data as fallback');
      return { 
        ...fallbackData.data, 
        fromCache: true, 
        expired: true,
        error: `Using cached data due to API error: ${error.message}`
      };
    }
    
    return { 
      games: [], 
      error: error.message
    };
  }
}

// Handler for getting game details with error handling and caching
async function handleGetGameDetails(gameId) {
  try {
    const cacheKey = getCacheKey('gameDetails', { gameId });
    
    // Try to get from cache first
    const cachedData = getCachedData(cacheKey, CACHE_DURATION.gameDetails);
    if (cachedData) {
      console.log(`Returning cached details for game ${gameId}`);
      return { ...cachedData, fromCache: true };
    }

    const result = await getGameDetails(gameId);
    
    // Cache the result
    setCachedData(cacheKey, { gameDetails: result });
    
    return { gameDetails: result };
  } catch (error) {
    console.warn(`IGDB API call failed for game ${gameId}:`, error.message);
    
    // Try to return cached data even if expired as fallback
    const cacheKey = getCacheKey('gameDetails', { gameId });
    const fallbackData = cacheStore ? cacheStore.get(cacheKey) : null;
    
    if (fallbackData) {
      console.log('Returning expired cached data as fallback');
      return { 
        ...fallbackData.data, 
        fromCache: true, 
        expired: true,
        error: `Using cached data due to API error: ${error.message}`
      };
    }
    
    return { 
      error: error.message
    };
  }
}

// Search games by name with debouncing and caching
async function searchGames(query, limit = 10) {
  try {
    if (!query || query.trim().length < 2) {
      return { games: [] };
    }
    
    const searchQuery = query.trim();
    
    // Construct the APIcalypse query for searching games
    const apiQuery = `
      fields name, cover.url, screenshots.url, first_release_date, platforms.name, rating, summary, genres.name;
      search "${searchQuery}";
      where (cover.url != null | screenshots.url != null) & platforms = (${PC_PLATFORM_IDS.join(',')});
      limit ${limit};
    `;
    
    const response = await makeApiRequest('games', apiQuery);
    
    // Transform the data to a more usable format
    const games = response.data.map(game => {
      let imageUrl = null;
      let imageType = 'landscape';
      
      // Prefer cover art for portrait view, fallback to screenshots
      if (game.cover?.url) {
        imageUrl = formatImageUrl(game.cover.url, 't_cover_small');
        imageType = 'portrait';
      } else if (game.screenshots && game.screenshots.length > 0) {
        imageUrl = formatImageUrl(game.screenshots[0].url, 't_screenshot_med');
        imageType = 'landscape';
      }
      
      return {
        appId: game.id,
        name: game.name,
        imageUrl: imageUrl,
        imageType: imageType,
        releaseDate: game.first_release_date ? new Date(game.first_release_date * 1000).getFullYear() : 'Unknown',
        platforms: game.platforms ? game.platforms.map(p => p.name).join(', ') : 'PC',
        genres: game.genres ? game.genres.map(g => g.name) : [],
        genresString: game.genres ? game.genres.map(g => g.name).join(', ') : 'Unknown',
        rating: game.rating ? Math.round(game.rating) : null,
        description: game.summary || 'No description available',
        summary: game.summary || 'No summary available'
      };
    });
    
    return { games };
  } catch (error) {
    console.error(`Error searching games from IGDB:`, error);
    throw error;
  }
}

// Handler for searching games with error handling
async function handleSearchGames(query, limit = 10) {
  try {
    const result = await searchGames(query, limit);
    return result;
  } catch (error) {
    console.warn('IGDB search API call failed:', error.message);
    return { 
      games: [], 
      error: error.message
    };
  }
}

// Create an API client for making requests to IGDB
function createApiClient() {
  return {
    async getPopularNewGames(limit, offset) {
      return getPopularNewGames(limit, offset);
    },
    
    async getGameDetails(gameId) {
      return getGameDetails(gameId);
    }
  };
}

// Get popular games from IGDB (actually popular, not just new) - PC only
async function getPopularNewGames(limit = 20, offset = 0) {
  try {
    // Use different query strategies based on offset to ensure we can get thousands of games
    let query;
    
    if (offset < 500) {
      // For early pages, prioritize highly rated recent games (5 years)
      const fiveYearsAgo = Math.floor(Date.now() / 1000) - (5 * 365 * 24 * 60 * 60);
      query = `
        fields name, cover.url, screenshots.url, first_release_date, platforms.name, rating, summary, genres.name;
        where first_release_date > ${fiveYearsAgo} & rating > 60 & (cover.url != null | screenshots.url != null) & platforms = (${PC_PLATFORM_IDS.join(',')});
        sort rating desc;
        limit ${limit};
        offset ${offset};
      `;
    } else if (offset < 1000) {
      // For middle pages, expand to older well-rated games (10 years)
      const tenYearsAgo = Math.floor(Date.now() / 1000) - (10 * 365 * 24 * 60 * 60);
      const adjustedOffset = offset - 500;
      query = `
        fields name, cover.url, screenshots.url, first_release_date, platforms.name, rating, summary, genres.name;
        where first_release_date > ${tenYearsAgo} & rating > 50 & (cover.url != null | screenshots.url != null) & platforms = (${PC_PLATFORM_IDS.join(',')});
        sort rating desc;
        limit ${limit};
        offset ${adjustedOffset};
      `;
    } else {
      // For later pages, include all games with decent ratings, sorted by popularity
      const adjustedOffset = offset - 1000;
      query = `
        fields name, cover.url, screenshots.url, first_release_date, platforms.name, rating, summary, genres.name, follows;
        where rating > 40 & (cover.url != null | screenshots.url != null) & platforms = (${PC_PLATFORM_IDS.join(',')});
        sort follows desc;
        limit ${limit};
        offset ${adjustedOffset};
      `;
    }
    
    const response = await makeApiRequest('games', query);
    
    // Transform the data to a more usable format
    const games = response.data.map(game => {
      let imageUrl = null;
      let imageType = 'landscape';
      
      // Prefer cover art for portrait view, fallback to screenshots
      if (game.cover?.url) {
        imageUrl = formatImageUrl(game.cover.url, 't_cover_big');
        imageType = 'portrait';
      } else if (game.screenshots && game.screenshots.length > 0) {
        imageUrl = formatImageUrl(game.screenshots[0].url, 't_screenshot_med');
        imageType = 'landscape';
      }
      
      return {
        appId: game.id,
        name: game.name,
        imageUrl: imageUrl,
        imageType: imageType,
        releaseDate: game.first_release_date ? new Date(game.first_release_date * 1000).toLocaleDateString() : 'Unknown',
        platforms: game.platforms ? game.platforms.map(p => p.name).join(', ') : 'PC',
        genres: game.genres ? game.genres.map(g => g.name) : [],
        genresString: game.genres ? game.genres.map(g => g.name).join(', ') : 'Unknown',
        rating: game.rating ? Math.round(game.rating) : null,
        description: game.summary || 'No description available',
        summary: game.summary || 'No summary available'
      };
    });
    
    return { games };
  } catch (error) {
    console.error('Error fetching popular games from IGDB:', error);
    throw error;
  }
}

// Get games by genre from IGDB - PC only
async function getGamesByGenre(genre, limit = 20, offset = 0, subCategory = null) {
  try {
    const genreId = GENRE_IDS[genre];
    if (!genreId) {
      throw new Error(`Unknown genre: ${genre}`);
    }
    
    // If sub-category is specified and not 'all', use search approach
    if (subCategory && subCategory !== 'all' && UNIVERSAL_SUB_CATEGORIES.some(c => c.id === subCategory)) {
      return await getGamesByGenreWithSubCategory(genre, genreId, limit, offset, subCategory);
    }
    
    // Standard genre filtering without sub-category
    return await getGamesByGenreStandard(genreId, limit, offset);
  } catch (error) {
    console.error(`Error fetching ${genre} games from IGDB:`, error);
    throw error;
  }
}

// Standard genre filtering without sub-category
async function getGamesByGenreStandard(genreId, limit = 20, offset = 0) {
  // Build the base query with genre filtering
  let baseQuery = `genres = ${genreId} & (cover.url != null | screenshots.url != null) & platforms = (${PC_PLATFORM_IDS.join(',')})`;
  
  // Use different query strategies based on offset to ensure we can get many more games per genre
  let query;
  
  if (offset < 400) {
    // For early pages, include all games with any rating, sorted by rating
    query = `
      fields name, cover.url, screenshots.url, first_release_date, platforms.name, rating, summary, genres.name;
      where ${baseQuery};
      sort rating desc;
      limit ${limit};
      offset ${offset};
    `;
  } else if (offset < 800) {
    // For middle pages, expand to include more games with decent ratings
    const adjustedOffset = offset - 400;
    query = `
      fields name, cover.url, screenshots.url, first_release_date, platforms.name, rating, summary, genres.name;
      where ${baseQuery} & rating > 50;
      sort rating desc;
      limit ${limit};
      offset ${adjustedOffset};
    `;
  } else {
    // For later pages, include all games in the genre with any rating, sorted by popularity
    const adjustedOffset = offset - 800;
    query = `
      fields name, cover.url, screenshots.url, first_release_date, platforms.name, rating, summary, genres.name, follows;
      where ${baseQuery};
      sort follows desc;
      limit ${limit};
      offset ${adjustedOffset};
    `;
  }
  
  const response = await makeApiRequest('games', query);
  return formatGameResults(response.data);
}

// Sub-category filtering using universal criteria
async function getGamesByGenreWithSubCategory(genre, genreId, limit = 20, offset = 0, subCategory) {
  // Build the base query with genre filtering
  let baseQuery = `genres = ${genreId} & (cover.url != null | screenshots.url != null) & platforms = (${PC_PLATFORM_IDS.join(',')})`;
  let query;
  
  // Get current date for time-based filtering
  const now = Math.floor(Date.now() / 1000);
  const oneYearAgo = now - (365 * 24 * 60 * 60); // 1 year ago
  const threeYearsAgo = now - (3 * 365 * 24 * 60 * 60); // 3 years ago
  const classicsEndDate = now - (10 * 365 * 24 * 60 * 60); // 10+ years ago for classics
  const classicsStartDate = now - (30 * 365 * 24 * 60 * 60); // Up to 30 years ago
  
  switch (subCategory) {
    case 'popular':
      // Popular: Recent games (last 2 years) with good ratings and community activity
      const twoYearsAgo = now - (2 * 365 * 24 * 60 * 60);
      query = `
        fields name, cover.url, screenshots.url, first_release_date, platforms.name, rating, summary, genres.name;
        where ${baseQuery} & first_release_date > ${twoYearsAgo} & rating > 70;
        sort rating desc, first_release_date desc;
        limit ${limit};
        offset ${offset};
      `;
      break;
      
    case 'new':
      // New: Games released in the last year, sorted by release date
      query = `
        fields name, cover.url, screenshots.url, first_release_date, platforms.name, rating, summary, genres.name;
        where ${baseQuery} & first_release_date > ${oneYearAgo};
        sort first_release_date desc;
        limit ${limit};
        offset ${offset};
      `;
      break;
      
    case 'classics':
      // Classics: Games from 10-25 years ago with excellent ratings
      query = `
        fields name, cover.url, screenshots.url, first_release_date, platforms.name, rating, summary, genres.name;
        where ${baseQuery} & first_release_date > ${classicsStartDate} & first_release_date < ${classicsEndDate} & rating > 75;
        sort rating desc;
        limit ${limit};
        offset ${offset};
      `;
      break;
      
    case 'high-rated':
      // High-rated: All-time highest rated games (85+)
      query = `
        fields name, cover.url, screenshots.url, first_release_date, platforms.name, rating, summary, genres.name;
        where ${baseQuery} & rating > 85;
        sort rating desc;
        limit ${limit};
        offset ${offset};
      `;
      break;
      
    default:
      // Fallback to standard genre filtering
      return await getGamesByGenreStandard(genreId, limit, offset);
  }
  
  const response = await makeApiRequest('games', query);
  const result = formatGameResults(response.data);
  
  return result;
}

// Helper function to format game results consistently
function formatGameResults(gameData) {
  const games = gameData.map(game => {
    let imageUrl = null;
    let imageType = 'landscape';
    
    // For category pages, prioritize screenshots over cover art
    if (game.screenshots && game.screenshots.length > 0) {
      imageUrl = formatImageUrl(game.screenshots[0].url, 't_screenshot_med');
      imageType = 'landscape';
    } else if (game.cover?.url) {
      imageUrl = formatImageUrl(game.cover.url, 't_cover_big');
      imageType = 'portrait';
    }
    
    return {
      appId: game.id,
      name: game.name,
      imageUrl: imageUrl,
      imageType: imageType,
      releaseDate: game.first_release_date ? new Date(game.first_release_date * 1000).toLocaleDateString() : 'Unknown',
      platforms: game.platforms ? game.platforms.map(p => p.name).join(', ') : 'PC',
      genres: game.genres ? game.genres.map(g => g.name) : [],
      genresString: game.genres ? game.genres.map(g => g.name).join(', ') : 'Unknown',
      rating: game.rating ? Math.round(game.rating) : null,
      description: game.summary || 'No description available',
      summary: game.summary || 'No summary available'
    };
  });
  
  return { games };
}

// Get featured games (highly rated recent releases) - PC only
async function getFeaturedGames(limit = 5) {
  try {
    // Calculate timestamp for 1 year ago (expanded from 6 months to get more results)
    const oneYearAgo = Math.floor(Date.now() / 1000) - (365 * 24 * 60 * 60);
    
    // Construct the APIcalypse query for featured PC games with artworks for better hero images
    const query = `
      fields name, cover.url, cover.image_id, artworks.url, artworks.image_id, 
             screenshots.url, screenshots.image_id, first_release_date, platforms.name, 
             rating, summary, genres.name;
      where first_release_date > ${oneYearAgo} & rating > 80 & 
            (artworks.url != null | screenshots.url != null | cover.url != null) & 
            platforms = (${PC_PLATFORM_IDS.join(',')});
      sort rating desc;
      limit ${limit};
    `;
    
    const response = await makeApiRequest('games', query);
    
    // Transform the data to a more usable format with priority on landscape images
    const games = response.data.map(game => {
      let imageUrl = null;
      let heroImageUrl = null;
      let imageType = 'landscape'; // Default to landscape
      
      // For featured games, prioritize high-resolution landscape images
      if (game.artworks && game.artworks.length > 0) {
        // Use artwork for best quality landscape image
        imageUrl = formatImageUrl(game.artworks[0].url, 't_1080p');
        heroImageUrl = formatImageUrl(game.artworks[0].url, 't_1080p');
        imageType = 'landscape';
      } else if (game.screenshots && game.screenshots.length > 0) {
        // Use screenshot as second choice for landscape
        imageUrl = formatImageUrl(game.screenshots[0].url, 't_screenshot_big_2x');
        heroImageUrl = formatImageUrl(game.screenshots[0].url, 't_screenshot_big_2x');
        imageType = 'landscape';
      } else if (game.cover?.url) {
        // Fallback to cover art with highest resolution
        imageUrl = formatImageUrl(game.cover.url, 't_cover_big_2x');
        heroImageUrl = formatImageUrl(game.cover.url, 't_cover_big_2x');
        imageType = 'portrait';
      }
      
      return {
        appId: game.id,
        name: game.name,
        imageUrl: imageUrl,
        heroImageUrl: heroImageUrl, // High-res hero image for featured display
        imageType: imageType, // Add explicit image type information
        releaseDate: game.first_release_date ? new Date(game.first_release_date * 1000).toLocaleDateString() : 'Unknown',
        platforms: game.platforms ? game.platforms.map(p => p.name).join(', ') : 'PC',
        genres: game.genres ? game.genres.map(g => g.name) : [],
        genresString: game.genres ? game.genres.map(g => g.name).join(', ') : 'Unknown',
        rating: game.rating ? Math.round(game.rating) : null,
        description: game.summary || 'No description available',
        summary: game.summary || 'No summary available'
      };
    });
    
    return { games };
  } catch (error) {
    console.error('Error fetching featured games from IGDB:', error);
    throw error;
  }
}

// Get details for a specific game
async function getGameDetails(gameId) {
  try {
    // Construct the APIcalypse query for comprehensive game details
    const query = `
      fields name, cover.url, cover.image_id, artworks.url, artworks.image_id, 
             first_release_date, platforms.name, rating, aggregated_rating, 
             summary, storyline, genres.name, themes.name, game_modes.name,
             screenshots.url, screenshots.image_id, videos.video_id, 
             involved_companies.company.name, involved_companies.developer, 
             involved_companies.publisher, involved_companies.porting,
             age_ratings.rating, age_ratings.category, 
             game_engines.name, player_perspectives.name,
             multiplayer_modes.*, websites.url, websites.category,
             similar_games.name, similar_games.cover.url,
             total_rating, total_rating_count, rating_count,
             release_dates.date, release_dates.platform.name, release_dates.region;
      where id = ${gameId};
    `;
    
    const response = await makeApiRequest('games', query);
    
    if (response.data.length === 0) {
      throw new Error(`Game with ID ${gameId} not found`);
    }
    
    const game = response.data[0];
    
    // Extract developers and publishers with more detail
    let developers = [];
    let publishers = [];
    let porters = [];
    
    if (game.involved_companies) {
      game.involved_companies.forEach(company => {
        if (company.developer) {
          developers.push(company.company.name);
        }
        if (company.publisher) {
          publishers.push(company.company.name);
        }
        if (company.porting) {
          porters.push(company.company.name);
        }
      });
    }

    // Get the best hero image - prefer artwork, fallback to cover
    let heroImageUrl = null;
    if (game.artworks && game.artworks.length > 0) {
      // Use the first artwork for hero image with highest resolution
      heroImageUrl = formatImageUrl(game.artworks[0].url, 't_1080p');
    } else if (game.cover?.url) {
      // Fallback to cover image with best available resolution
      heroImageUrl = formatImageUrl(game.cover.url, 't_cover_big_2x');
    }

    // Format release dates by platform
    let releaseDates = [];
    if (game.release_dates) {
      releaseDates = game.release_dates.map(rd => ({
        date: rd.date ? new Date(rd.date * 1000).toLocaleDateString() : 'TBA',
        platform: rd.platform?.name || 'Unknown',
        region: rd.region || 'Unknown'
      }));
    }

    // Extract age ratings
    let ageRatings = [];
    if (game.age_ratings) {
      ageRatings = game.age_ratings.map(rating => ({
        category: rating.category,
        rating: rating.rating
      }));
    }

    // Extract multiplayer information
    let multiplayerInfo = null;
    if (game.multiplayer_modes && game.multiplayer_modes.length > 0) {
      const mp = game.multiplayer_modes[0];
      multiplayerInfo = {
        offlineMax: mp.offlinemax || 1,
        onlineMax: mp.onlinemax || 0,
        campaignCoop: mp.campaigncoop || false,
        splitscreen: mp.splitscreen || false,
        lanCoop: mp.lancoop || false
      };
    }

    // Extract similar games
    let similarGames = [];
    if (game.similar_games) {
      similarGames = game.similar_games.slice(0, 6).map(sg => ({
        id: sg.id,
        name: sg.name,
        imageUrl: sg.cover?.url ? formatImageUrl(sg.cover.url, 't_cover_small') : null
      }));
    }

    // Transform the data to a comprehensive format
    const gameDetails = {
      appId: game.id,
      name: game.name,
      
      // Images - high resolution hero image
      imageUrl: game.cover?.url ? formatImageUrl(game.cover.url, 't_cover_big') : null,
      heroImageUrl: heroImageUrl, // New high-res hero image
      
      // Basic info
      releaseDate: game.first_release_date ? new Date(game.first_release_date * 1000).toLocaleDateString() : 'Unknown',
      platforms: game.platforms ? game.platforms.map(p => p.name).join(', ') : 'PC',
      
      // Ratings
      rating: game.rating ? Math.round(game.rating) : null,
      aggregatedRating: game.aggregated_rating ? Math.round(game.aggregated_rating) : null,
      totalRating: game.total_rating ? Math.round(game.total_rating) : null,
      totalRatingCount: game.total_rating_count || 0,
      ratingCount: game.rating_count || 0,
      
      // Content
      summary: game.summary || 'No summary available',
      description: game.summary || 'No description available',
      storyline: game.storyline || '',
      
      // Categories
      genres: game.genres ? game.genres.map(g => g.name) : [],
      genresString: game.genres ? game.genres.map(g => g.name).join(', ') : 'Unknown',
      themes: game.themes ? game.themes.map(t => t.name) : [],
      gameModes: game.game_modes ? game.game_modes.map(gm => gm.name) : [],
      
      // Media
      screenshots: game.screenshots ? game.screenshots.map(s => formatImageUrl(s.url, 't_screenshot_big_2x')) : [],
      artworks: game.artworks ? game.artworks.map(a => formatImageUrl(a.url, 't_1080p')) : [],
      videos: game.videos ? game.videos.map(v => v.video_id) : [],
      
      // Company info
      developers: developers.join(', ') || 'Unknown',
      publishers: publishers.join(', ') || 'Unknown',
      porters: porters.join(', ') || null,
      developer: developers[0] || 'Unknown',
      publisher: publishers[0] || 'Unknown',
      
      // Technical info
      gameEngines: game.game_engines ? game.game_engines.map(ge => ge.name) : [],
      playerPerspectives: game.player_perspectives ? game.player_perspectives.map(pp => pp.name) : [],
      
      // Additional data
      releaseDates: releaseDates,
      ageRatings: ageRatings,
      multiplayerInfo: multiplayerInfo,
      similarGames: similarGames,
      websites: game.websites ? game.websites.map(w => ({ url: w.url, category: w.category })) : []
    };
    
    return gameDetails;
  } catch (error) {
    console.error(`Error fetching details for game ${gameId} from IGDB:`, error);
    throw error;
  }
}

// Get universal sub-categories
function getUniversalSubCategories() {
  return UNIVERSAL_SUB_CATEGORIES;
}

module.exports = {
  initIgdbService,
  getPopularNewGames,
  getGameDetails,
  createApiClient,
  getUniversalSubCategories
};

module.exports