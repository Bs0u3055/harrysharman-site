/**
 * AI Harry Chatbot Loader
 * 
 * Add this script to your HTML to enable the chatbot:
 * <script src="/js/init-ai-harry.js"></script>
 * 
 * Or embed directly in the page:
 * <script>
 *   window.AIHarryConfig = { autoLoad: true };
 *   !function() { var s = document.createElement('script');
 *     s.src = 'https://harrysharman.com/js/init-ai-harry.js';
 *     document.head.appendChild(s);
 *   }();
 * </script>
 */

(function() {
    // Check if already loaded
    if (window.__aiHarryLoaded) return;
    window.__aiHarryLoaded = true;

    const config = window.AIHarryConfig || {};
    const autoLoad = config.autoLoad !== false; // Default true

    // Create iframe container
    function initChatbot() {
        // Create wrapper div
        const wrapper = document.createElement('div');
        wrapper.id = 'ai-harry-wrapper';
        wrapper.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 400px;
            height: 600px;
            border-radius: 12px;
            box-shadow: 0 5px 40px rgba(0, 0, 0, 0.16);
            z-index: 9999;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            display: none;
        `;

        // Mobile responsive
        if (window.innerWidth <= 480) {
            wrapper.style.width = 'calc(100% - 20px)';
            wrapper.style.height = 'calc(100vh - 100px)';
            wrapper.style.left = '10px';
            wrapper.style.right = '10px';
            wrapper.style.bottom = '10px';
        }

        // Create iframe
        const iframe = document.createElement('iframe');
        iframe.src = '/html/ai-harry-chatbot.html';
        iframe.style.cssText = `
            width: 100%;
            height: 100%;
            border: none;
            border-radius: 12px;
        `;
        iframe.setAttribute('title', 'AI Harry Chatbot');

        wrapper.appendChild(iframe);
        document.body.appendChild(wrapper);

        // Create toggle button
        const toggle = document.createElement('button');
        toggle.id = 'ai-harry-toggle';
        toggle.innerHTML = '💬';
        toggle.setAttribute('aria-label', 'Open AI Harry');
        toggle.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 56px;
            height: 56px;
            border-radius: 50%;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: white;
            border: none;
            cursor: pointer;
            font-size: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            transition: transform 0.3s ease;
            z-index: 9998;
            font-family: inherit;
        `;

        // Mobile responsive
        if (window.innerWidth <= 480) {
            toggle.style.bottom = '10px';
            toggle.style.right = '10px';
        }

        toggle.addEventListener('click', () => {
            const isOpen = wrapper.style.display !== 'none';
            wrapper.style.display = isOpen ? 'none' : 'block';
            toggle.style.display = isOpen ? 'flex' : 'none';
            
            // Try to focus iframe input if opened
            if (!isOpen) {
                try {
                    setTimeout(() => {
                        iframe.contentWindow?.document?.getElementById('chatbotInput')?.focus?.();
                    }, 300);
                } catch (e) {
                    // Cross-origin, silent fail
                }
            }
        });

        toggle.addEventListener('mouseenter', () => {
            if (wrapper.style.display === 'none') {
                toggle.style.transform = 'scale(1.1)';
            }
        });

        toggle.addEventListener('mouseleave', () => {
            toggle.style.transform = 'scale(1)';
        });

        document.body.appendChild(toggle);

        // Sync open/close between iframe and wrapper
        window.addEventListener('message', (e) => {
            if (e.data?.type === 'ai-harry-close') {
                wrapper.style.display = 'none';
                toggle.style.display = 'flex';
            }
        });
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initChatbot);
    } else {
        initChatbot();
    }

    // Handle responsive resize
    window.addEventListener('resize', () => {
        const wrapper = document.getElementById('ai-harry-wrapper');
        const toggle = document.getElementById('ai-harry-toggle');
        
        if (wrapper && toggle) {
            if (window.innerWidth <= 480) {
                wrapper.style.width = 'calc(100% - 20px)';
                wrapper.style.height = 'calc(100vh - 100px)';
                wrapper.style.left = '10px';
                wrapper.style.right = '10px';
                wrapper.style.bottom = '10px';
                toggle.style.bottom = '10px';
                toggle.style.right = '10px';
            } else {
                wrapper.style.width = '400px';
                wrapper.style.height = '600px';
                wrapper.style.left = 'auto';
                wrapper.style.right = '20px';
                wrapper.style.bottom = '20px';
                toggle.style.bottom = '20px';
                toggle.style.right = '20px';
            }
        }
    });
})();
