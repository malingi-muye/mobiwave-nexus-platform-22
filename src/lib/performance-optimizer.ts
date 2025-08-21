/**
 * Performance optimization utilities
 * Provides tools for optimizing React app performance
 */

import React, { useCallback, useMemo, useRef, useEffect } from 'react';
import { log } from './production-logger';

// Debounce hook for expensive operations
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = React.useState<T>(value);

  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// Throttle hook for high-frequency events
export function useThrottle<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  const throttledCallback = useRef<T>();
  const lastExecuted = useRef<number>(0);

  const throttle = useCallback(
    (...args: Parameters<T>) => {
      const now = Date.now();
      if (now - lastExecuted.current >= delay) {
        lastExecuted.current = now;
        return callback(...args);
      }
    },
    [callback, delay]
  ) as T;

  throttledCallback.current = throttle;
  return throttledCallback.current;
}

// Intersection Observer hook for lazy loading
export function useIntersectionObserver(
  elementRef: React.RefObject<Element>,
  options?: IntersectionObserverInit
): boolean {
  const [isIntersecting, setIsIntersecting] = React.useState(false);

  React.useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsIntersecting(entry.isIntersecting);
      },
      {
        threshold: 0.1,
        ...options
      }
    );

    observer.observe(element);

    return () => {
      observer.unobserve(element);
    };
  }, [elementRef, options]);

  return isIntersecting;
}

// Memoized component wrapper
export function withMemo<P extends object>(
  Component: React.ComponentType<P>,
  areEqual?: (prevProps: P, nextProps: P) => boolean
) {
  return React.memo(Component, areEqual);
}

// Performance measurement hook
export function usePerformanceMonitor(componentName: string) {
  const renderStart = useRef<number>(0);
  const renderCount = useRef<number>(0);

  useEffect(() => {
    renderStart.current = performance.now();
    renderCount.current += 1;
  });

  useEffect(() => {
    const renderTime = performance.now() - renderStart.current;
    
    if (renderTime > 16) { // 16ms = 60fps threshold
      log.warn(`Slow render detected in ${componentName}`, {
        renderTime: `${renderTime.toFixed(2)}ms`,
        renderCount: renderCount.current
      });
    }

    // Log performance metrics every 10 renders
    if (renderCount.current % 10 === 0) {
      log.debug(`Performance metrics for ${componentName}`, {
        renderCount: renderCount.current,
        lastRenderTime: `${renderTime.toFixed(2)}ms`
      });
    }
  });
}

// Image lazy loading component
interface LazyImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  placeholder?: string;
  threshold?: number;
}

export const LazyImage: React.FC<LazyImageProps> = ({
  src,
  placeholder = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2VlZSIvPjwvc3ZnPg==',
  threshold = 0.1,
  ...props
}) => {
  const imgRef = useRef<HTMLImageElement>(null);
  const isInView = useIntersectionObserver(imgRef, { threshold });
  const [isLoaded, setIsLoaded] = React.useState(false);
  const [hasError, setHasError] = React.useState(false);

  const handleLoad = useCallback(() => {
    setIsLoaded(true);
  }, []);

  const handleError = useCallback(() => {
    setHasError(true);
    log.warn('Image failed to load', { src });
  }, [src]);

  return (
    <img
      ref={imgRef}
      src={isInView ? src : placeholder}
      onLoad={handleLoad}
      onError={handleError}
      style={{
        opacity: isLoaded ? 1 : 0.5,
        transition: 'opacity 0.3s ease',
        ...props.style
      }}
      {...props}
    />
  );
};

// Virtual list component for large datasets
interface VirtualListProps<T> {
  items: T[];
  itemHeight: number;
  containerHeight: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  overscan?: number;
}

export function VirtualList<T>({
  items,
  itemHeight,
  containerHeight,
  renderItem,
  overscan = 5
}: VirtualListProps<T>) {
  const [scrollTop, setScrollTop] = React.useState(0);

  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    items.length - 1,
    Math.floor((scrollTop + containerHeight) / itemHeight) + overscan
  );

  const visibleItems = items.slice(startIndex, endIndex + 1);

  const handleScroll = useThrottle((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, 16); // ~60fps

  return (
    <div
      style={{ height: containerHeight, overflow: 'auto' }}
      onScroll={handleScroll}
    >
      <div style={{ height: items.length * itemHeight, position: 'relative' }}>
        <div
          style={{
            transform: `translateY(${startIndex * itemHeight}px)`,
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0
          }}
        >
          {visibleItems.map((item, index) =>
            renderItem(item, startIndex + index)
          )}
        </div>
      </div>
    </div>
  );
}

// Bundle size analyzer
export class BundleAnalyzer {
  private static loadTimes: Map<string, number> = new Map();

  static trackChunkLoad(chunkName: string, startTime: number) {
    const loadTime = performance.now() - startTime;
    this.loadTimes.set(chunkName, loadTime);
    
    log.info(`Chunk loaded: ${chunkName}`, {
      loadTime: `${loadTime.toFixed(2)}ms`
    });

    // Warn if chunk takes too long to load
    if (loadTime > 1000) {
      log.warn(`Slow chunk load: ${chunkName}`, {
        loadTime: `${loadTime.toFixed(2)}ms`
      });
    }
  }

  static getLoadTimes(): Record<string, number> {
    return Object.fromEntries(this.loadTimes);
  }

  static getAverageLoadTime(): number {
    const times = Array.from(this.loadTimes.values());
    return times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
  }
}

// Resource preloader
export class ResourcePreloader {
  private static preloadedResources: Set<string> = new Set();

  static preloadImage(src: string): Promise<void> {
    if (this.preloadedResources.has(src)) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.preloadedResources.add(src);
        resolve();
      };
      img.onerror = reject;
      img.src = src;
    });
  }

  static preloadScript(src: string): Promise<void> {
    if (this.preloadedResources.has(src)) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.onload = () => {
        this.preloadedResources.add(src);
        resolve();
      };
      script.onerror = reject;
      script.src = src;
      document.head.appendChild(script);
    });
  }

  static preloadStylesheet(href: string): Promise<void> {
    if (this.preloadedResources.has(href)) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'style';
      link.onload = () => {
        this.preloadedResources.add(href);
        resolve();
      };
      link.onerror = reject;
      link.href = href;
      document.head.appendChild(link);
    });
  }
}

// Performance metrics collector
export class PerformanceMetrics {
  static collectWebVitals() {
    // Collect Core Web Vitals
    if ('performance' in window) {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      
      const metrics = {
        // First Contentful Paint
        fcp: navigation.responseEnd - navigation.requestStart,
        // Largest Contentful Paint (approximation)
        lcp: navigation.loadEventEnd - navigation.requestStart,
        // First Input Delay (requires user interaction)
        fid: 0, // Would need actual user interaction to measure
        // Cumulative Layout Shift (requires layout shift observer)
        cls: 0, // Would need layout shift observer to measure
        // Time to Interactive (approximation)
        tti: navigation.domInteractive - navigation.requestStart,
        // Total Blocking Time (approximation)
        tbt: Math.max(0, navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart - 50)
      };

      log.info('Web Vitals collected', metrics);
      return metrics;
    }

    return null;
  }

  static measureComponentRender<T extends Record<string, any>>(
    componentName: string,
    props: T
  ): (result: any) => any {
    const startTime = performance.now();
    
    return (result: any) => {
      const renderTime = performance.now() - startTime;
      
      if (renderTime > 16) {
        log.warn(`Slow component render: ${componentName}`, {
          renderTime: `${renderTime.toFixed(2)}ms`,
          props: JSON.stringify(props, null, 2).slice(0, 200) + '...'
        });
      }

      return result;
    };
  }
}

// Initialize performance monitoring
if (typeof window !== 'undefined') {
  // Collect initial metrics
  window.addEventListener('load', () => {
    setTimeout(() => {
      PerformanceMetrics.collectWebVitals();
    }, 0);
  });

  // Monitor long tasks
  if ('PerformanceObserver' in window) {
    try {
      const longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > 50) {
            log.warn('Long task detected', {
              duration: `${entry.duration.toFixed(2)}ms`,
              startTime: entry.startTime
            });
          }
        }
      });
      
      longTaskObserver.observe({ entryTypes: ['longtask'] });
    } catch (error) {
      log.debug('Long task observer not supported');
    }
  }
}
