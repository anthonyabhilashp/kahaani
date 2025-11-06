import { useState, useMemo } from 'react';
import { X, Search, MessageCircle, ChevronRight, HelpCircle } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { knowledgeBase, categories, type KnowledgeArticle } from '@/lib/knowledgeBase';

interface HelpWidgetProps {
  open: boolean;
  onClose: () => void;
}

export function HelpWidget({ open, onClose }: HelpWidgetProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedArticle, setSelectedArticle] = useState<KnowledgeArticle | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Search and filter articles
  const filteredArticles = useMemo(() => {
    if (!searchQuery && !selectedCategory) {
      return knowledgeBase;
    }

    let results = knowledgeBase;

    // Filter by category
    if (selectedCategory) {
      results = results.filter(article => article.category === selectedCategory);
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      results = results.filter(article => {
        // Search in title
        if (article.title.toLowerCase().includes(query)) return true;

        // Search in keywords
        if (article.keywords.some(keyword => keyword.toLowerCase().includes(query))) return true;

        // Search in content
        if (article.content.toLowerCase().includes(query)) return true;

        return false;
      });
    }

    return results;
  }, [searchQuery, selectedCategory]);

  // Group articles by category
  const articlesByCategory = useMemo(() => {
    const grouped: { [key: string]: KnowledgeArticle[] } = {};

    filteredArticles.forEach(article => {
      if (!grouped[article.category]) {
        grouped[article.category] = [];
      }
      grouped[article.category].push(article);
    });

    return grouped;
  }, [filteredArticles]);

  const handleReset = () => {
    setSearchQuery('');
    setSelectedArticle(null);
    setSelectedCategory(null);
  };

  const openTawkChat = () => {
    // This will be integrated with Tawk.to
    // @ts-ignore
    if (typeof window !== 'undefined' && window.Tawk_API) {
      // @ts-ignore
      window.Tawk_API.maximize();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0 bg-white dark:bg-gray-950 border-gray-200 dark:border-gray-800 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
              <HelpCircle className="w-5 h-5 text-orange-500" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              {selectedArticle ? selectedArticle.title : 'Help & Support'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(85vh - 140px)' }}>
          {selectedArticle ? (
            /* Article View */
            <div className="bg-white dark:bg-gray-950">
              <div className="max-w-3xl mx-auto px-8 py-8">
                <button
                  onClick={() => setSelectedArticle(null)}
                  className="text-orange-500 hover:text-orange-600 text-sm font-medium mb-8 flex items-center gap-2 transition-colors group"
                >
                  <span className="group-hover:-translate-x-1 transition-transform">←</span>
                  <span>Back to articles</span>
                </button>

                <article className="prose prose-lg dark:prose-invert max-w-none">
                  {selectedArticle.content.split('\n').map((line, idx) => {
                    // Empty lines
                    if (line.trim() === '') {
                      return <div key={idx} className="h-4" />;
                    }

                    // H1
                    if (line.startsWith('# ')) {
                      return (
                        <h1 key={idx} className="text-3xl font-bold text-gray-900 dark:text-white mt-8 mb-4 first:mt-0">
                          {line.substring(2)}
                        </h1>
                      );
                    }

                    // H2
                    if (line.startsWith('## ')) {
                      return (
                        <h2 key={idx} className="text-2xl font-semibold text-gray-900 dark:text-white mt-8 mb-4 first:mt-0 pb-2 border-b border-gray-200 dark:border-gray-800">
                          {line.substring(3)}
                        </h2>
                      );
                    }

                    // H3
                    if (line.startsWith('### ')) {
                      return (
                        <h3 key={idx} className="text-xl font-semibold text-orange-600 dark:text-orange-400 mt-6 mb-3 first:mt-0">
                          {line.substring(4)}
                        </h3>
                      );
                    }

                    // Numbered lists
                    if (line.match(/^\d+\.\s/)) {
                      const text = line.replace(/^\d+\.\s/, '');
                      const number = line.match(/^(\d+)\./)?.[1];
                      return (
                        <div key={idx} className="flex gap-3 mb-3 items-start">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-500 text-white text-sm font-semibold flex items-center justify-center">
                            {number}
                          </span>
                          <span className="flex-1 text-gray-700 dark:text-gray-300 pt-0.5">{text}</span>
                        </div>
                      );
                    }

                    // Bullet points
                    if (line.startsWith('- ')) {
                      const text = line.substring(2);
                      return (
                        <div key={idx} className="flex gap-3 mb-2 items-start">
                          <span className="text-orange-500 text-lg leading-6 font-bold">•</span>
                          <span className="flex-1 text-gray-700 dark:text-gray-300">{text.replace(/\*\*(.*?)\*\*/g, '<strong class="text-gray-900 dark:text-white font-semibold">$1</strong>')}</span>
                        </div>
                      );
                    }

                    // Emoji bullets
                    if (line.match(/^(✅|❌|⚠️|💡|⭐|🎯|📝|🔧) /)) {
                      const emoji = line[0];
                      const text = line.substring(2);

                      return (
                        <div key={idx} className="flex gap-3 mb-2 items-start">
                          <span className="text-xl leading-6">{emoji}</span>
                          <span className="flex-1 text-gray-700 dark:text-gray-300">{text}</span>
                        </div>
                      );
                    }

                    // Regular paragraphs
                    const processedLine = line
                      .replace(/\*\*(.*?)\*\*/g, '<strong class="text-gray-900 dark:text-white font-semibold">$1</strong>')
                      .replace(/`(.*?)`/g, '<code class="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-orange-600 dark:text-orange-400 text-sm font-mono">$1</code>');

                    return (
                      <p
                        key={idx}
                        className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4 text-base"
                        dangerouslySetInnerHTML={{ __html: processedLine }}
                      />
                    );
                  })}
                </article>
              </div>
            </div>
          ) : (
            /* Browse/Search View */
            <div className="p-8 bg-white dark:bg-gray-950">
              {/* Search Bar */}
              <div className="mb-8">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <Input
                    type="text"
                    placeholder="Search for help articles..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-12 pr-4 py-6 bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-900 dark:text-white placeholder:text-gray-500 focus:border-orange-500 focus:ring-orange-500 rounded-xl text-base"
                  />
                </div>
                {(searchQuery || selectedCategory) && (
                  <button
                    onClick={handleReset}
                    className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white mt-3 font-medium"
                  >
                    Clear filters
                  </button>
                )}
              </div>

              {/* Category Filters */}
              {!searchQuery && !selectedCategory && (
                <div className="mb-8">
                  <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">Browse by Category</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {categories.map(cat => (
                      <button
                        key={cat.id}
                        onClick={() => setSelectedCategory(cat.id)}
                        className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-800 hover:border-orange-500 dark:hover:border-orange-500 rounded-xl transition-all text-left group"
                      >
                        <span className="text-gray-900 dark:text-white font-medium">{cat.name}</span>
                        <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-orange-500 group-hover:translate-x-1 transition-all" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Results */}
              {(searchQuery || selectedCategory) && (
                <div>
                  {selectedCategory && (
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold text-white">
                        {categories.find(c => c.id === selectedCategory)?.name}
                      </h3>
                      <p className="text-sm text-gray-400 mt-1">
                        {filteredArticles.length} {filteredArticles.length === 1 ? 'article' : 'articles'}
                      </p>
                    </div>
                  )}

                  {searchQuery && (
                    <div className="mb-4">
                      <p className="text-sm text-gray-400">
                        Found {filteredArticles.length} {filteredArticles.length === 1 ? 'result' : 'results'} for "{searchQuery}"
                      </p>
                    </div>
                  )}

                  {filteredArticles.length === 0 ? (
                    <div className="text-center py-12">
                      <HelpCircle className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                      <p className="text-gray-400 mb-4">No articles found</p>
                      <button
                        onClick={handleReset}
                        className="text-orange-500 hover:text-orange-400 text-sm font-medium"
                      >
                        Clear search and browse all articles
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {Object.entries(articlesByCategory).map(([categoryId, articles]) => (
                        <div key={categoryId}>
                          {!selectedCategory && (
                            <h4 className="text-sm font-semibold text-gray-400 mb-2 mt-4">
                              {categories.find(c => c.id === categoryId)?.name}
                            </h4>
                          )}
                          {articles.map(article => (
                            <button
                              key={article.id}
                              onClick={() => setSelectedArticle(article)}
                              className="w-full flex items-start justify-between p-3 bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-gray-600 rounded-lg transition-colors text-left group"
                            >
                              <div className="flex-1">
                                <h5 className="text-white font-medium text-sm mb-1 group-hover:text-orange-400 transition-colors">
                                  {article.title}
                                </h5>
                                <p className="text-xs text-gray-500 line-clamp-2">
                                  {article.content.substring(0, 100)}...
                                </p>
                              </div>
                              <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-orange-400 transition-colors flex-shrink-0 ml-2 mt-1" />
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer - Chat with Support */}
        <div className="border-t border-gray-800 p-4 bg-gray-950">
          <button
            onClick={openTawkChat}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-lg transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
            <span>Can't find what you need? Chat with Support</span>
          </button>
          <p className="text-center text-xs text-gray-500 mt-2">
            We typically respond within a few hours
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
