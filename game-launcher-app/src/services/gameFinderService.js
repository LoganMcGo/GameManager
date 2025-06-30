// Game Finder Service
// Searches for game content across multiple torrent providers and APIs
class GameFinderService {
  constructor() {
    this.downloadQueue = new Map();
    this.searchProviders = [];
    this.jackettConfig = {
      enabled: false,
      url: 'http://localhost:9117',
      apiKey: null
    };
    this.providerSettings = this.loadProviderSettings();
    this.initializeProviders();
  }

  async initializeProviders() {
    // Initialize public API providers (always available)
    await this.initializePublicProviders();
    
    // Try to initialize Jackett if configured
    await this.initializeJackett();
  }

  async initializePublicProviders() {
    this.searchProviders = [
      {
        name: 'PUBLIC_APIS',
        search: this.searchPublicAPIs.bind(this),
        enabled: true,
        priority: 2
      }
    ];
  }

  async initializeJackett() {
    // Check if Jackett is configured and available
    const jackettSettings = this.loadJackettSettings();
    if (jackettSettings.enabled && jackettSettings.apiKey) {
      this.jackettConfig = jackettSettings;
      
      try {
        const isAvailable = await this.testJackettConnection();
        if (isAvailable) {
          this.searchProviders.unshift({
            name: 'JACKETT',
            search: this.searchJackett.bind(this),
            enabled: true,
            priority: 1
          });
          console.log('✅ Jackett integration enabled');
        }
      } catch (error) {
        console.warn('⚠️ Jackett not available:', error.message);
      }
    }
  }

  // Load provider settings from localStorage
  loadProviderSettings() {
    try {
      const settings = localStorage.getItem('torrentProviderSettings');
      return settings ? JSON.parse(settings) : {
        ThePirateBay: { enabled: true, name: 'The Pirate Bay', description: 'Large torrent database' },
        Nyaa: { enabled: true, name: 'Nyaa.si', description: 'Good for Japanese games' }
      };
    } catch {
      return {
        ThePirateBay: { enabled: true, name: 'The Pirate Bay', description: 'Large torrent database' },
        Nyaa: { enabled: true, name: 'Nyaa.si', description: 'Good for Japanese games' }
      };
    }
  }

  // Load Jackett settings from localStorage or config
  loadJackettSettings() {
    try {
      const settings = localStorage.getItem('jackettSettings');
      return settings ? JSON.parse(settings) : this.jackettConfig;
    } catch {
      return this.jackettConfig;
    }
  }

  // Test Jackett connection
  async testJackettConnection() {
    if (!this.jackettConfig.enabled || !this.jackettConfig.apiKey) return false;
    
    try {
      const response = await fetch(
        `${this.jackettConfig.url}/api/v2.0/server/config?apikey=${this.jackettConfig.apiKey}`,
        { 
          method: 'GET',
          timeout: 5000,
          signal: AbortSignal.timeout(5000)
        }
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  // Search using Jackett
  async searchJackett(gameName) {
    if (!this.jackettConfig.enabled) return [];

    try {
      const params = new URLSearchParams({
        apikey: this.jackettConfig.apiKey,
        Query: `${gameName} game`,
        Category: '2000,2010,2020,2030,2040,2050,2060', // Game categories
        Tracker: 'all'
      });

      const response = await fetch(
        `${this.jackettConfig.url}/api/v2.0/indexers/all/results?${params}`,
        { 
          timeout: 15000,
          signal: AbortSignal.timeout(15000)
        }
      );
      
      if (!response.ok) throw new Error(`Jackett API error: ${response.status}`);
      
      const data = await response.json();
      return this.formatJackettResults(data.Results || []);
    } catch (error) {
      console.error('Jackett search error:', error);
      return [];
    }
  }

  // Format Jackett results
  formatJackettResults(results) {
    return results.map(item => ({
      name: item.Title,
      magnet: item.MagnetUri || item.Link,
      size: item.Size,
      seeders: item.Seeders || 0,
      leechers: item.Peers || 0,
      source: item.Tracker || 'Jackett',
      quality: this.calculateQuality(item.Title, item.Seeders, item.Size),
      publishDate: item.PublishDate
    })).filter(item => item.magnet && item.magnet.startsWith('magnet:'));
  }

  // Search using working public APIs
  async searchPublicAPIs(gameName) {
    console.log(`🔍 Starting public API search for: ${gameName}`);
    
    try {
      const allSearches = [
        { name: 'ThePirateBay', search: this.searchTPB(gameName) },
        { name: 'Nyaa', search: this.searchNyaa(gameName) }
      ];

      // Filter searches based on provider settings
      const enabledSearches = allSearches.filter(({ name }) => {
        const isEnabled = this.providerSettings[name]?.enabled ?? true;
        if (!isEnabled) {
          console.log(`⏭️ Skipping ${name} (disabled in settings)`);
        }
        return isEnabled;
      });

      console.log(`🔍 Enabled providers: ${enabledSearches.map(s => s.name).join(', ')}`);

      const results = [];
      
      for (const { name, search } of enabledSearches) {
        try {
          console.log(`🔍 Trying ${name}...`);
          const apiResults = await Promise.race([
            search,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
          ]);
          
          console.log(`✅ ${name} returned ${apiResults.length} results`);
          results.push(...apiResults);
        } catch (error) {
          console.warn(`❌ ${name} failed:`, error.message);
        }
      }

      console.log(`📊 Total results from public APIs: ${results.length}`);
      return results.filter(Boolean);
    } catch (error) {
      console.error('❌ Public API search failed:', error);
      return [];
    }
  }

  // Search ThePirateBay (using a working proxy)
  async searchTPB(gameName) {
    try {
      console.log(`🔍 TPB: Searching for "${gameName}"`);
      
      // Try multiple search approaches
      let data = [];
      
      // First try: search with game category
      try {
        const response1 = await fetch(`https://apibay.org/q.php?q=${encodeURIComponent(gameName)}&cat=400`);
        if (response1.ok) {
          data = await response1.json();
          console.log(`📊 TPB: Category search response:`, data);
        }
      } catch (e) {
        console.warn('❌ TPB: Category search failed');
      }
      
      // If no results, try without category
      if (!Array.isArray(data) || data.length === 0) {
        try {
          const response2 = await fetch(`https://apibay.org/q.php?q=${encodeURIComponent(gameName)}`);
          if (response2.ok) {
            data = await response2.json();
            console.log(`📊 TPB: General search response:`, data);
          }
        } catch (e) {
          console.warn('❌ TPB: General search failed');
        }
      }
      
      // If still no results, try a simple search term
      if (!Array.isArray(data) || data.length === 0) {
        try {
          const simpleSearch = gameName.split(' ')[0]; // Just first word
          const response3 = await fetch(`https://apibay.org/q.php?q=${encodeURIComponent(simpleSearch)}`);
          if (response3.ok) {
            data = await response3.json();
            console.log(`📊 TPB: Simple search response for "${simpleSearch}":`, data);
          }
        } catch (e) {
          console.warn('❌ TPB: Simple search failed');
        }
      }
      
      if (!Array.isArray(data) || data.length === 0) {
        console.warn('❌ TPB: No results found after all attempts');
        return [];
      }
      
      // Filter out invalid/error responses from TPB API
      const validItems = data.filter(item => {
        // Check for valid torrent data
        if (!item || typeof item !== 'object') {
          console.log('❌ TPB: Invalid item (not object):', item);
          return false;
        }
        
        // Check for required fields
        if (!item.name || !item.info_hash) {
          console.log('❌ TPB: Missing required fields:', item);
          return false;
        }
        
        // Filter out error responses that sometimes get returned as "torrents"
        if (item.name.toLowerCase().includes('no results') || 
            item.name.toLowerCase().includes('error') ||
            item.name.toLowerCase().includes('not found') ||
            item.info_hash === '0000000000000000000000000000000000000000') {
          console.log('❌ TPB: Error response detected:', item.name);
          return false;
        }
        
        // Ensure seeders is a valid number
        const seeders = parseInt(item.seeders);
        if (isNaN(seeders) || seeders < 0) {
          console.log('❌ TPB: Invalid seeders:', item.seeders);
          return false;
        }
        
        // Ensure info_hash is valid (40 character hex string)
        if (!/^[a-fA-F0-9]{40}$/.test(item.info_hash)) {
          console.log('❌ TPB: Invalid info_hash:', item.info_hash);
          return false;
        }
        
        return true;
      });
      
      if (validItems.length === 0) {
        console.warn('❌ TPB: No valid torrents after filtering');
        return [];
      }
      
      const results = validItems.map(item => ({
        name: item.name,
        magnet: `magnet:?xt=urn:btih:${item.info_hash}&dn=${encodeURIComponent(item.name)}&tr=udp://tracker.coppersurfer.tk:6969/announce&tr=udp://9.rarbg.to:2920/announce&tr=udp://tracker.opentrackr.org:1337&tr=udp://tracker.internetwarriors.net:1337/announce`,
        size: parseInt(item.size) || 0,
        seeders: parseInt(item.seeders) || 0,
        leechers: parseInt(item.leechers) || 0,
        source: 'ThePirateBay',
        quality: this.calculateQuality(item.name, parseInt(item.seeders), parseInt(item.size))
      }));
      
      console.log(`✅ TPB: Processed ${results.length} results`);
      return results;
    } catch (error) {
      console.error('❌ TPB error:', error);
      return [];
    }
  }

  // Search Nyaa.si (good for some games, especially Japanese)
  async searchNyaa(gameName) {
    try {
      console.log(`🔍 Nyaa: Searching for "${gameName}"`);
      
      const response = await fetch(`https://nyaa.si/?page=rss&q=${encodeURIComponent(gameName)}&c=6_2`);
      if (!response.ok) {
        console.warn(`❌ Nyaa: Request failed with status ${response.status}`);
        return [];
      }
      
      const text = await response.text();
      console.log(`📊 Nyaa: Raw RSS response received`);
      
      const items = this.parseRSSFeed(text);
      const results = items.map(item => ({
        name: item.title,
        magnet: item.magnet,
        size: item.size || 0,
        seeders: 0, // RSS doesn't include seeder info
        leechers: 0,
        source: 'Nyaa.si',
        quality: this.calculateQuality(item.title, 0, item.size)
      }));
      
      console.log(`✅ Nyaa: Processed ${results.length} results`);
      return results;
    } catch (error) {
      console.error('❌ Nyaa error:', error);
      return [];
    }
  }

  // Simple RSS parser for torrent feeds
  parseRSSFeed(rssText) {
    const items = [];
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(rssText, 'text/xml');
      const itemElements = doc.querySelectorAll('item');
      
      itemElements.forEach(item => {
        const title = item.querySelector('title')?.textContent;
        const link = item.querySelector('link')?.textContent;
        const description = item.querySelector('description')?.textContent;
        
        // Extract magnet link from description or use link
        let magnet = link;
        if (description && description.includes('magnet:')) {
          const magnetMatch = description.match(/magnet:\?[^"'\s]+/);
          if (magnetMatch) magnet = magnetMatch[0];
        }
        
        // Extract size from description
        let size = 0;
        if (description) {
          const sizeMatch = description.match(/(\d+(?:\.\d+)?)\s*(GB|MB|KB)/i);
          if (sizeMatch) {
            const sizeValue = parseFloat(sizeMatch[1]);
            const unit = sizeMatch[2].toUpperCase();
            size = unit === 'GB' ? sizeValue * 1024 * 1024 * 1024 :
                   unit === 'MB' ? sizeValue * 1024 * 1024 :
                   sizeValue * 1024;
          }
        }
        
        if (title && magnet) {
          items.push({ title, magnet, size });
        }
      });
    } catch (error) {
      console.error('RSS parsing error:', error);
    }
    return items;
  }

  // Main search function - tries all available providers
  async searchTorrents(gameName) {
    try {
      console.log(`🔍 Searching torrents for: ${gameName}`);

      // Search all available providers in priority order
      const results = await this.searchAllProviders(gameName);
      
      if (results.length === 0) {
        return { success: true, data: [] };
      }

      // Convert results to AvailableDownloads format
      const formattedResults = results.map(torrent => {
        const isRepack = this.isRepackTorrent(torrent.name);
        return {
          title: torrent.name,
          url: torrent.magnet,
          description: `${isRepack ? '📦 Repack | ' : ''}Seeders: ${torrent.seeders || 0} | Quality Score: ${torrent.quality || 0} | Source: ${torrent.source}`,
          size: this.formatSize(torrent.size),
          source: torrent.source,
          magnet: torrent.magnet,
          seeders: torrent.seeders || 0,
          quality: torrent.quality || 0,
          isRepack: isRepack,
          repackType: isRepack ? this.getRepackType(torrent.name) : null
        };
      });

      console.log(`✅ Found ${formattedResults.length} torrents for "${gameName}"`);
      
      return {
        success: true,
        data: formattedResults
      };

    } catch (error) {
      console.error(`❌ Search failed for ${gameName}:`, error);
      return {
        success: false,
        error: error.message,
        data: []
      };
    }
  }

  // Search all configured providers
  async searchAllProviders(gameName) {
    // Sort providers by priority (Jackett first if available)
    const sortedProviders = this.searchProviders
      .filter(provider => provider.enabled)
      .sort((a, b) => (a.priority || 999) - (b.priority || 999));

    const searches = sortedProviders.map(provider => 
      provider.search(gameName).catch(err => {
        console.warn(`Provider ${provider.name} failed:`, err.message);
        return [];
      })
    );

    const results = await Promise.all(searches);
    const allResults = results.flat().filter(Boolean);
    
    // Remove duplicates and filter for games
    return this.filterAndDeduplicateResults(allResults, gameName);
  }

  // Filter results specifically for games with intelligent matching
  filterAndDeduplicateResults(results, gameName) {
    console.log(`🔍 Filtering ${results.length} raw results for "${gameName}"`);
    
    const seen = new Set();
    const gameKeywords = ['game', 'repack', 'fitgirl', 'dodi', 'codex', 'skidrow', 'plaza', 'gog', 'steam'];
    
    const filtered = results.filter(item => {
      // Basic validation
      if (!item.magnet || !item.name) {
        console.log(`❌ Filtered out: Missing magnet or name - ${item.name || 'unnamed'}`);
        return false;
      }
      
      // Duplicate check by hash
      const hash = this.extractHashFromMagnet(item.magnet);
      if (hash && seen.has(hash)) {
        console.log(`❌ Filtered out: Duplicate hash - ${item.name}`);
        return false;
      }
      if (hash) seen.add(hash);
      
      // Smart game relevance check
      const relevanceScore = this.calculateGameRelevance(item.name, gameName);
      const isGameRelease = gameKeywords.some(keyword => item.name.toLowerCase().includes(keyword));
      
      // More strict relevance filtering - must be game-related AND have some relevance to search term
      const isRelevant = (relevanceScore.score > 10) && (isGameRelease || relevanceScore.score > 30);
      
      if (!isRelevant) {
        console.log(`❌ Filtered out: Low relevance (${relevanceScore.score}) - ${item.name}`);
        return false;
      }
      
      // Size filtering (reasonable game sizes: 10MB to 200GB)
      const sizeBytes = typeof item.size === 'string' ? this.parseSize(item.size) : item.size;
      const reasonableSize = !sizeBytes || (sizeBytes > 10 * 1024 * 1024 && sizeBytes < 200 * 1024 * 1024 * 1024);
      
      if (!reasonableSize) {
        console.log(`❌ Filtered out: Size too small/large - ${item.name} (${this.formatSize(sizeBytes)})`);
        return false;
      }
      
      // Seeder threshold - prefer torrents with at least 1 seeder, but allow 0 for rare games
      const hasDecentSeeders = !item.seeders || item.seeders >= 0;
      
      if (!hasDecentSeeders) {
        console.log(`❌ Filtered out: Not enough seeders - ${item.name} (${item.seeders} seeders)`);
        return false;
      }
      
      console.log(`✅ Keeping: ${item.name} (relevance: ${relevanceScore.score}, ${item.seeders} seeders, ${this.formatSize(sizeBytes)})`);
      return true;
    });

    console.log(`📊 After filtering: ${filtered.length} results remaining`);
    
    // Calculate enhanced quality scores that include relevance
    const withQuality = filtered.map(item => {
      const baseQuality = this.calculateQuality(item.name, item.seeders, item.size);
      const relevanceScore = this.calculateGameRelevance(item.name, gameName);
      
      return {
        ...item,
        quality: baseQuality + relevanceScore.score, // Boost quality with relevance
        relevance: relevanceScore.score,
        matchType: relevanceScore.type
      };
    });

    // Sort by relevance first, then quality
    const sorted = withQuality.sort((a, b) => {
      // Primary sort: relevance score
      if (Math.abs(a.relevance - b.relevance) > 20) {
        return b.relevance - a.relevance;
      }
      // Secondary sort: overall quality
      return b.quality - a.quality;
    });
    
    const final = sorted.slice(0, 50); // Limit to top 50 results
    
    console.log(`📊 Final results: ${final.length} torrents`);
    final.forEach((item, i) => {
      console.log(`${i + 1}. ${item.name} (relevance: ${item.relevance}, quality: ${item.quality}, type: ${item.matchType})`);
    });
    
    return final;
  }

  // Calculate how relevant a torrent name is to the search term
  calculateGameRelevance(torrentName, searchTerm) {
    const torrent = torrentName.toLowerCase();
    const search = searchTerm.toLowerCase();
    
    // Remove common words that don't affect relevance (but keep repacker names and versions)
    const cleanTorrent = this.cleanGameTitle(torrent);
    const cleanSearch = this.cleanGameTitle(search);
    
    let score = 0;
    let matchType = 'none';
    
    // 1. Exact match (highest priority)
    if (cleanTorrent === cleanSearch) {
      score = 100;
      matchType = 'exact';
    }
    // 2. Exact match including common variations
    else if (this.isExactVariation(cleanTorrent, cleanSearch)) {
      score = 90;
      matchType = 'exact_variation';
    }
    // 3. Search term is at the start of torrent name
    else if (cleanTorrent.startsWith(cleanSearch)) {
      score = 80;
      matchType = 'starts_with';
    }
    // 4. All search words present as complete words
    else if (this.hasAllWordsComplete(cleanTorrent, cleanSearch)) {
      score = 70;
      matchType = 'all_words_complete';
    }
    // 5. Search term appears as complete substring
    else if (torrent.includes(search)) {
      score = 60;
      matchType = 'contains_complete';
    }
    // 6. Most search words present
    else {
      const wordMatchScore = this.calculateWordMatchScore(cleanTorrent, cleanSearch);
      if (wordMatchScore > 0.6) {
        score = Math.floor(wordMatchScore * 50);
        matchType = 'partial_words';
      }
    }
    
    // Boost for enhanced/definitive/complete editions when searching for base game
    if (score > 30 && this.isEnhancedEdition(torrent) && !this.isEnhancedEdition(search)) {
      score += 15;
      matchType += '_enhanced';
    }
    
    // Penalty for numbered sequels when searching for base game (but NOT version numbers)
    if (score > 30 && this.isNumberedSequel(torrent, search)) {
      score -= 30;
      matchType += '_sequel_penalty';
    }
    
    // Bonus for newer versions
    const versionBonus = this.calculateVersionBonus(torrent);
    if (versionBonus > 0) {
      score += versionBonus;
      matchType += '_newer_version';
    }
    
    // Bonus for trusted repackers (these are quality indicators)
    const repackerBonus = this.calculateRepackerBonus(torrent);
    if (repackerBonus > 0) {
      score += repackerBonus;
      matchType += '_trusted_repacker';
    }
    
    return { score, type: matchType };
  }

  // Clean game title by removing only non-essential words (preserve repacker names and versions)
  cleanGameTitle(title) {
    return title
      .replace(/[\[\]()]/g, ' ')  // Remove brackets
      .replace(/\b(repack|cracked?|full)\b/gi, ' ') // Only remove generic release terms
      .replace(/\s+/g, ' ')       // Normalize spaces
      .trim();
  }

  // Check if torrent name is an exact variation of search term
  isExactVariation(torrent, search) {
    // Handle common variations like "Game Name" vs "GameName" vs "Game-Name"
    const normalize = (str) => str.replace(/[\s\-_\.]/g, '').toLowerCase();
    return normalize(torrent) === normalize(search);
  }

  // Check if all search words appear as complete words in torrent
  hasAllWordsComplete(torrent, search) {
    const searchWords = search.split(/\s+/).filter(word => word.length > 2);
    if (searchWords.length === 0) return false;
    
    return searchWords.every(word => {
      const regex = new RegExp(`\\b${word}\\b`, 'i');
      return regex.test(torrent);
    });
  }

  // Calculate what percentage of search words are found in torrent
  calculateWordMatchScore(torrent, search) {
    const searchWords = search.split(/\s+/).filter(word => word.length > 2);
    if (searchWords.length === 0) return 0;
    
    const foundWords = searchWords.filter(word => torrent.includes(word));
    return foundWords.length / searchWords.length;
  }

  // Check if this is an enhanced/definitive edition
  isEnhancedEdition(title) {
    const enhancedKeywords = ['enhanced', 'definitive', 'complete', 'ultimate', 'director', 'goty', 'game of the year', 'special', 'deluxe', 'premium'];
    return enhancedKeywords.some(keyword => title.includes(keyword));
  }

  // Check if this appears to be a numbered sequel (NOT version numbers)
  isNumberedSequel(torrent, search) {
    // Don't penalize if search already contains numbers
    if (/\d/.test(search)) return false;
    
    // Look for sequel indicators that suggest this is a different game
    const sequelPatterns = [
      /\b(ii|iii|iv|v|vi|vii|viii|ix|x)\b(?!\s*\d)/i,  // Roman numerals not followed by digits
      /\b\d+(?!\.\d)\b/,  // Numbers not followed by decimal (to avoid version numbers)
      /\b(two|three|four|five|six|seven|eight|nine|ten)\b/i  // Written numbers
    ];
    
    // Check if torrent has sequel patterns but search doesn't
    return sequelPatterns.some(pattern => {
      const torrentMatch = pattern.test(torrent);
      const searchMatch = pattern.test(search);
      return torrentMatch && !searchMatch;
    });
  }

  // Calculate bonus for newer versions
  calculateVersionBonus(torrent) {
    // Different version patterns with their relative importance
    const versionPatterns = [
      { 
        regex: /\bv?(\d+)\.(\d+)\.(\d+)([a-z]?)\b/gi, 
        type: 'semantic',
        priority: 100 
      },
      { 
        regex: /\bv?(\d+)\.(\d+)([a-z]?)\b/gi, 
        type: 'major_minor',
        priority: 90 
      },
      { 
        regex: /\b(20\d{2})\.(\d{1,2})\.(\d{1,2})\b/gi, 
        type: 'date',
        priority: 80 
      },
      { 
        regex: /\bbuild\s*(\d+)\b/gi, 
        type: 'build',
        priority: 70 
      }
    ];

    let bestVersionScore = 0;
    let bestVersionType = '';

    versionPatterns.forEach(pattern => {
      const matches = [...torrent.matchAll(pattern.regex)];
      
      matches.forEach(match => {
        let score = 0;
        
        switch (pattern.type) {
          case 'semantic':
            {
              const major = parseInt(match[1]) || 0;
              const minor = parseInt(match[2]) || 0;
              const patch = parseInt(match[3]) || 0;
              const suffix = match[4] || '';
              
              // Semantic version scoring: major.minor.patch
              score = major * 10000 + minor * 100 + patch;
              
              // Handle alpha/beta suffixes (lower priority than stable)
              if (suffix === 'a' || suffix.includes('alpha')) score -= 5;
              else if (suffix === 'b' || suffix.includes('beta') || suffix.includes('rc')) score -= 3;
              
              console.log(`Version ${match[0]}: major=${major}, minor=${minor}, patch=${patch}, suffix='${suffix}', score=${score}`);
            }
            break;
            
          case 'major_minor':
            {
              const major = parseInt(match[1]) || 0;
              const minor = parseInt(match[2]) || 0;
              const suffix = match[3] || '';
              
              // Major.minor scoring (treat as .0 patch)
              score = major * 10000 + minor * 100;
              
              // Handle alpha/beta suffixes
              if (suffix === 'a' || suffix.includes('alpha')) score -= 5;
              else if (suffix === 'b' || suffix.includes('beta') || suffix.includes('rc')) score -= 3;
              
              console.log(`Version ${match[0]}: major=${major}, minor=${minor}, suffix='${suffix}', score=${score}`);
            }
            break;
            
          case 'date':
            {
              const year = parseInt(match[1]) || 0;
              const month = parseInt(match[2]) || 0;
              const day = parseInt(match[3]) || 0;
              
              // Date scoring (more recent = higher score)
              score = (year - 2020) * 1000 + month * 30 + day;
              
              console.log(`Date version ${match[0]}: year=${year}, month=${month}, day=${day}, score=${score}`);
            }
            break;
            
          case 'build':
            {
              const buildNumber = parseInt(match[1]) || 0;
              
              // Build number scoring (higher build = higher score)
              score = Math.min(buildNumber / 1000, 9999); // Cap to prevent overflow
              
              console.log(`Build version ${match[0]}: build=${buildNumber}, score=${score}`);
            }
            break;
        }
        
        // Apply pattern priority multiplier
        const weightedScore = score * (pattern.priority / 100);
        
        if (weightedScore > bestVersionScore) {
          bestVersionScore = weightedScore;
          bestVersionType = pattern.type;
        }
      });
    });

    // Convert to bonus points (0-15 points based on version)
    const bonus = Math.min(Math.floor(bestVersionScore / 500), 15);
    
    if (bonus > 0) {
      console.log(`Best version score: ${bestVersionScore} (${bestVersionType}), bonus: ${bonus}`);
    }
    
    return bonus;
  }

  // Calculate bonus for trusted repackers
  calculateRepackerBonus(torrent) {
    const repackerBonuses = {
      'fitgirl': 10,      // Highest quality, most trusted
      'dodi': 8,          // High quality, trusted
      'gog': 7,           // Official DRM-free releases
      'codex': 6,         // Well-known scene group
      'plaza': 6,         // Well-known scene group
      'skidrow': 5,       // Established scene group
      'steam': 4,         // Official platform releases
      'empress': 4,       // Known for difficult cracks
      'cpy': 3,           // Copy scene group
      'reloaded': 3       // Established group
    };
    
    let maxBonus = 0;
    Object.entries(repackerBonuses).forEach(([repacker, bonus]) => {
      if (torrent.includes(repacker)) {
        maxBonus = Math.max(maxBonus, bonus);
      }
    });
    
    return maxBonus;
  }

  // Extract hash from magnet link
  extractHashFromMagnet(magnetUri) {
    if (!magnetUri) return null;
    const match = magnetUri.match(/xt=urn:btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})/i);
    return match ? match[1].toLowerCase() : null;
  }

  // Calculate torrent quality score
  calculateQuality(torrent, seeders, size) {
    let score = 0;
    const name = (typeof torrent === 'string' ? torrent : torrent.name || '').toLowerCase();
    
    // Seeder score (0-40 points)
    score += Math.min((seeders || 0) * 2, 40);
    
    // Repacker reputation (0-30 points)
    if (name.includes('fitgirl')) score += 30;
    else if (name.includes('dodi')) score += 28;
    else if (name.includes('repack')) score += 20;
    else if (name.includes('codex') || name.includes('skidrow') || name.includes('plaza')) score += 25;
    else if (name.includes('gog') || name.includes('steam')) score += 15;
    
    // Size preference (0-20 points) - prefer reasonable sizes
    const sizeGB = (size || 0) / (1024 * 1024 * 1024);
    if (sizeGB > 0.5 && sizeGB < 50) score += 20;
    else if (sizeGB <= 0.5) score += 10;
    else if (sizeGB > 80) score -= 10;
    
    // Language preference (0-10 points)
    if (name.includes('english') || name.includes('multi')) score += 10;
    else if (name.includes('language')) score += 5;
    
    return score;
  }

  // Download a game (finds best torrent and adds to Real-Debrid)
  async downloadGame(gameName) {
    try {
      console.log(`📦 Starting download for: ${gameName}`);

      // Search for torrents
      const searchResult = await this.searchTorrents(gameName);
      
      if (!searchResult.success || searchResult.data.length === 0) {
        return {
          success: false,
          error: 'No torrents found for this game'
        };
      }

      // Get the best torrent (first one since they're sorted by quality)
      const bestTorrent = searchResult.data[0];
      
      console.log(`✅ Found best torrent: ${bestTorrent.title} (Quality: ${bestTorrent.quality})`);

      // Add to Real-Debrid
      const result = await this.addToRealDebrid({
        magnet: bestTorrent.magnet || bestTorrent.url,
        name: bestTorrent.title || gameName
      });
      
      return result;

    } catch (error) {
      console.error(`❌ Download failed for ${gameName}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Download a specific torrent magnet link
  async downloadTorrent(magnetLink, torrentName = 'Game') {
    try {
      console.log(`📦 Adding to Real-Debrid: ${torrentName}`);

      // Add to Real-Debrid
      const result = await this.addToRealDebrid({ magnet: magnetLink, name: torrentName });
      
      console.log(`✅ Successfully added "${torrentName}" to Real-Debrid`);
      
      return {
        success: true,
        message: 'Added to Real-Debrid successfully!'
      };

    } catch (error) {
      console.error(`❌ Download failed for ${torrentName}:`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Add torrent to Real-Debrid with automatic file selection
  async addToRealDebrid(torrent) {
    if (!window.api?.realDebrid) {
      throw new Error('Real-Debrid API not available');
    }

    console.log('🚀 Adding magnet to Real-Debrid with auto-start:', torrent.name || 'Unknown');
    
    // Use the new addMagnetAndStart method for complete workflow
    const result = await window.api.realDebrid.addMagnetAndStart(torrent.magnet);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to add to Real-Debrid');
    }
    
    // Log the result details
    if (result.filesSelected) {
      console.log('✅ Magnet added and download started automatically');
    } else if (result.selectError) {
      console.warn('⚠️ Magnet added but auto-start failed:', result.selectError);
    }
    
    return result;
  }

  // Start direct download from URL (for Real-Debrid unrestricted links)
  async startDirectDownload(downloadInfo) {
    try {
      console.log(`🔄 Starting direct download: ${downloadInfo.name}`);
      
      // Check if we have the download API available
      if (!window.api?.download) {
        throw new Error('Download API not available');
      }
      
      // Get download location
      const downloadLocation = this.getDownloadLocation();
      if (!downloadLocation) {
        throw new Error('Download location not set. Please configure download location in settings.');
      }
      
      // Add to download queue
      this.downloadQueue.set(downloadInfo.id, {
        ...downloadInfo,
        timestamp: Date.now()
      });
      
      // Start the download using the main process download API
      const result = await window.api.download.startDownload({
        url: downloadInfo.url,
        filename: downloadInfo.name,
        downloadPath: downloadLocation,
        downloadId: downloadInfo.id
      });
      
      if (result.success) {
        console.log(`✅ Direct download started: ${downloadInfo.name}`);
        
        // Update download status
        this.downloadQueue.set(downloadInfo.id, {
          ...downloadInfo,
          status: 'downloading',
          timestamp: Date.now()
        });
        
        return { success: true, downloadId: downloadInfo.id };
      } else {
        console.error(`❌ Failed to start direct download: ${result.error}`);
        
        // Update download status to failed
        this.downloadQueue.set(downloadInfo.id, {
          ...downloadInfo,
          status: 'failed',
          error: result.error,
          timestamp: Date.now()
        });
        
        return { success: false, error: result.error };
      }
      
    } catch (error) {
      console.error(`❌ Error starting direct download:`, error);
      
      // Update download status to failed
      if (downloadInfo.id) {
        this.downloadQueue.set(downloadInfo.id, {
          ...downloadInfo,
          status: 'failed',
          error: error.message,
          timestamp: Date.now()
        });
      }
      
      return { success: false, error: error.message };
    }
  }

  // Configure Jackett settings
  configureJackett(settings) {
    this.jackettConfig = { ...this.jackettConfig, ...settings };
    
    // Save to localStorage
    try {
      localStorage.setItem('jackettSettings', JSON.stringify(this.jackettConfig));
    } catch (error) {
      console.error('Failed to save Jackett settings:', error);
    }
    
    // Reinitialize providers
    this.initializeProviders();
    
    return this.jackettConfig;
  }

  // Get current Jackett status
  async getJackettStatus() {
    if (!this.jackettConfig.enabled) {
      return { enabled: false, connected: false, message: 'Jackett not configured' };
    }
    
    try {
      const connected = await this.testJackettConnection();
      return {
        enabled: true,
        connected,
        message: connected ? 'Jackett connected successfully' : 'Jackett not responding',
        url: this.jackettConfig.url
      };
    } catch (error) {
      return {
        enabled: true,
        connected: false,
        message: `Jackett connection error: ${error.message}`,
        url: this.jackettConfig.url
      };
    }
  }

  // Configure provider settings
  configureProviders(settings) {
    this.providerSettings = { ...this.providerSettings, ...settings };
    
    // Save to localStorage
    try {
      localStorage.setItem('torrentProviderSettings', JSON.stringify(this.providerSettings));
    } catch (error) {
      console.error('Failed to save provider settings:', error);
    }
    
    return this.providerSettings;
  }

  // Get current provider settings
  getProviderSettings() {
    return this.providerSettings;
  }

  // Get download status
  getDownloadStatus(downloadId) {
    return this.downloadQueue.get(downloadId);
  }

  // Utility: Format size for display
  formatSize(sizeBytes) {
    if (!sizeBytes || sizeBytes === 0) return 'Unknown';
    
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = sizeBytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  // Utility: Parse size string to bytes
  parseSize(sizeStr) {
    if (typeof sizeStr === 'number') return sizeStr;
    if (!sizeStr) return 0;
    
    const units = { B: 1, KB: 1024, MB: 1024**2, GB: 1024**3, TB: 1024**4 };
    const match = sizeStr.match(/^([\d.]+)\s*([KMGT]?B)$/i);
    if (!match) return 0;
    
    const [, size, unit] = match;
    return parseFloat(size) * (units[unit.toUpperCase()] || 1);
  }

    // Get download location
  getDownloadLocation() {
    try {
      return localStorage.getItem('downloadLocation') || '';
    } catch (error) {
      console.error('Error loading download location:', error);
      return '';
    }
  }

  // Set download location
  async setDownloadLocation(location) {
    try {
      // Save to localStorage for frontend
      localStorage.setItem('downloadLocation', location);
      
      // Also sync with the backend download service
      if (window.api?.download?.setDownloadLocation) {
        const result = await window.api.download.setDownloadLocation(location);
        if (!result.success) {
          console.warn('Failed to sync download location with backend:', result.error);
        }
      }
      
      return true;
    } catch (error) {
      console.error('Error saving download location:', error);
      throw new Error('Failed to save download location');
    }
  }

  // Check if a torrent is a repack
  isRepackTorrent(torrentName) {
    const repackIndicators = [
      'fitgirl', 'dodi', 'masquerade', 'repack', 'repacked',
      'darck', 'selective', 'skidrow', 'codex', 'plaza'
    ];
    
    const name = torrentName.toLowerCase();
    return repackIndicators.some(indicator => name.includes(indicator));
  }

  // Get the repack type from torrent name
  getRepackType(torrentName) {
    const name = torrentName.toLowerCase();
    
    if (name.includes('fitgirl')) return 'FitGirl Repack';
    if (name.includes('dodi')) return 'DODI Repack';
    if (name.includes('masquerade')) return 'Masquerade Repack';
    if (name.includes('darck')) return 'Darck Repack';
    if (name.includes('selective')) return 'Selective Repack';
    if (name.includes('skidrow')) return 'SKIDROW Release';
    if (name.includes('codex')) return 'CODEX Release';
    if (name.includes('plaza')) return 'PLAZA Release';
    if (name.includes('repack')) return 'Game Repack';
    
    return 'Compressed Release';
  }

  // Clean up old download statuses
  cleanup() {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    for (const [id, status] of this.downloadQueue.entries()) {
      if (status.timestamp && status.timestamp < oneHourAgo) {
        this.downloadQueue.delete(id);
      }
    }
  }
}

export default new GameFinderService();
