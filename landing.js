class LandingPageController {
    constructor() {
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.setupAnimations();
        this.detectUserAgent();
        this.preloadGamePages();
    }
    
    setupEventListeners() {
        // Play buttons
        const playWebBtn = document.getElementById('playWebBtn');
        if (playWebBtn) {
            playWebBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.handlePlayButtonClick();
            });
        }
        
        // Smooth scrolling for anchor links
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', (e) => {
                e.preventDefault();
                const target = document.querySelector(anchor.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            });
        });
        
        // Feature card interactions
        document.querySelectorAll('.feature-card').forEach(card => {
            card.addEventListener('mouseenter', this.onFeatureCardHover);
            card.addEventListener('mouseleave', this.onFeatureCardLeave);
        });
        
        // Download tracking
        document.querySelectorAll('a[href*="github.com"]').forEach(link => {
            link.addEventListener('click', (e) => {
                this.trackDownload(link.href);
            });
        });
        
        // Intersection Observer for animations
        this.setupScrollAnimations();
    }
    
    handlePlayButtonClick() {
        // Detect if user is on mobile
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
                         window.innerWidth <= 768;
        
        if (isMobile) {
            // Redirect to mobile version
            window.location.href = 'android-index.html';
        } else {
            // Redirect to desktop version
            window.location.href = 'index.html';
        }
    }
    
    detectUserAgent() {
        const userAgent = navigator.userAgent.toLowerCase();
        const isAndroid = userAgent.includes('android');
        const isIOS = userAgent.includes('iphone') || userAgent.includes('ipad');
        const isMobile = isAndroid || isIOS || window.innerWidth <= 768;
        
        // Update download recommendations based on platform
        if (isAndroid) {
            this.highlightAndroidDownload();
        }
        
        // Add platform-specific classes
        document.body.classList.add(
            isMobile ? 'mobile-device' : 'desktop-device',
            isAndroid ? 'android-device' : '',
            isIOS ? 'ios-device' : ''
        );
        
        // Update play button text based on device
        const playBtn = document.getElementById('playWebBtn');
        if (playBtn && isMobile) {
            playBtn.innerHTML = '📱 Play on Mobile';
        }
    }
    
    highlightAndroidDownload() {
        const androidCard = document.querySelector('.download-card:not(.featured)');
        if (androidCard) {
            androidCard.classList.add('recommended');
            
            // Add recommendation badge
            const badge = document.createElement('div');
            badge.className = 'recommendation-badge';
            badge.textContent = 'Recommended for your device';
            androidCard.insertBefore(badge, androidCard.firstChild);
        }
    }
    
    setupAnimations() {
        // Animate game preview elements
        this.animateGamePreview();
        
        // Add entrance animations to key elements
        const animatedElements = document.querySelectorAll('.feature-card, .download-card, .community-btn');
        animatedElements.forEach((element, index) => {
            element.style.animationDelay = `${index * 0.1}s`;
            element.classList.add('fade-in');
        });
    }
    
    animateGamePreview() {
        const previewWorld = document.querySelector('.preview-world');
        if (!previewWorld) return;
        
        // Add dynamic tile animations
        const tiles = previewWorld.querySelectorAll('.tile');
        tiles.forEach((tile, index) => {
            setTimeout(() => {
                tile.style.opacity = '1';
                tile.style.transform = 'scale(1)';
            }, index * 50);
        });
        
        // Animate resource counter updates
        this.animateResourceCounters();
    }
    
    animateResourceCounters() {
        const resourceElements = document.querySelectorAll('.preview-resources span');
        
        setInterval(() => {
            resourceElements.forEach(element => {
                const currentText = element.textContent;
                const [emoji, value] = currentText.split(' ');
                const numValue = parseInt(value) || 0;
                const newValue = numValue + Math.floor(Math.random() * 10) + 1;
                
                element.textContent = `${emoji} ${newValue}`;
                element.style.animation = 'pulse 0.3s ease';
                
                setTimeout(() => {
                    element.style.animation = '';
                }, 300);
            });
        }, 3000);
    }
    
    setupScrollAnimations() {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('animate-in');
                }
            });
        }, {
            threshold: 0.2,
            rootMargin: '-50px'
        });
        
        // Observe key sections
        document.querySelectorAll('.section-title, .feature-card, .step, .biome, .download-card, .stat').forEach(el => {
            observer.observe(el);
        });
    }
    
    onFeatureCardHover(e) {
        const card = e.target;
        const icon = card.querySelector('.feature-icon');
        if (icon) {
            icon.style.transform = 'scale(1.2) rotate(5deg)';
            icon.style.transition = 'transform 0.3s ease';
        }
    }
    
    onFeatureCardLeave(e) {
        const card = e.target;
        const icon = card.querySelector('.feature-icon');
        if (icon) {
            icon.style.transform = 'scale(1) rotate(0deg)';
        }
    }
    
    trackDownload(url) {
        // Simple download tracking (can be enhanced with analytics)
        console.log('Download initiated:', url);
        
        // You could send this to analytics service
        if (window.gtag) {
            gtag('event', 'download', {
                'download_url': url,
                'file_type': url.includes('.apk') ? 'APK' : 'GitHub'
            });
        }
    }
    
    preloadGamePages() {
        // Preload game pages for faster navigation
        const preloadUrls = ['index.html', 'android-index.html'];
        
        preloadUrls.forEach(url => {
            const link = document.createElement('link');
            link.rel = 'prefetch';
            link.href = url;
            document.head.appendChild(link);
        });
    }
    
    // Dynamic content updates
    updateCommunityStats() {
        // This could fetch real stats from GitHub API
        fetch('https://api.github.com/repos/your-username/viking-settlement-tycoon')
            .then(response => response.json())
            .then(data => {
                const starsElement = document.querySelector('.stat-number');
                if (starsElement && data.stargazers_count) {
                    starsElement.textContent = `${data.stargazers_count}+`;
                }
            })
            .catch(error => {
                console.log('Could not fetch GitHub stats:', error);
            });
    }
}

// Enhanced CSS animations
const additionalStyles = `
    .recommendation-badge {
        background: linear-gradient(135deg, #4caf50 0%, #66bb6a 100%);
        color: white;
        padding: 8px 16px;
        border-radius: 20px;
        font-size: 0.8rem;
        font-weight: 700;
        text-align: center;
        margin-bottom: 15px;
        animation: glow 2s ease-in-out infinite alternate;
    }
    
    @keyframes glow {
        from { box-shadow: 0 0 5px rgba(76, 175, 80, 0.5); }
        to { box-shadow: 0 0 15px rgba(76, 175, 80, 0.8); }
    }
    
    @keyframes pulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.1); }
        100% { transform: scale(1); }
    }
    
    .animate-in {
        opacity: 1 !important;
        transform: translateY(0) !important;
        transition: all 0.8s ease;
    }
    
    .mobile-device .hero-visual {
        order: -1;
    }
    
    .mobile-device .hero-content {
        text-align: center;
    }
    
    .android-device .download-card:not(.featured) {
        border-color: #4caf50;
        background: rgba(76, 175, 80, 0.1);
    }
`;

// Add additional styles
const styleSheet = document.createElement('style');
styleSheet.textContent = additionalStyles;
document.head.appendChild(styleSheet);

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    new LandingPageController();
});

// Performance optimizations
window.addEventListener('load', () => {
    // Remove loading states
    document.body.classList.add('loaded');
    
    // Initialize lazy loading for images if needed
    if ('IntersectionObserver' in window) {
        const lazyImages = document.querySelectorAll('img[data-src]');
        const imageObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    img.src = img.dataset.src;
                    img.classList.add('loaded');
                    imageObserver.unobserve(img);
                }
            });
        });
        
        lazyImages.forEach(img => imageObserver.observe(img));
    }
});

// Handle service worker registration for PWA functionality
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then((registration) => {
                console.log('SW registered: ', registration);
            })
            .catch((registrationError) => {
                console.log('SW registration failed: ', registrationError);
            });
    });
}

// Export for potential external use
window.VikingTycoonLanding = LandingPageController;