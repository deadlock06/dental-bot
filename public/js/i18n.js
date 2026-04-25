document.addEventListener('DOMContentLoaded', () => {
  const defaultLang = 'en';
  let currentLang = localStorage.getItem('qz_lang') || defaultLang;

  // Load language dictionaries
  const loadTranslations = async (lang) => {
    try {
      const response = await fetch(`/lang/${lang}.json`);
      if (!response.ok) throw new Error('Network response was not ok');
      const translations = await response.json();
      
      // Update DOM
      document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (translations[key]) {
          // If it's a simple text element
          if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
             el.value = translations[key];
          } else {
             el.innerHTML = translations[key];
          }
        }
      });

      document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (translations[key]) {
          el.setAttribute('placeholder', translations[key]);
        }
      });

      // Update document direction and lang
      document.documentElement.lang = lang;
      // We are forcing LTR for Global English, Spanish, French
      document.documentElement.dir = 'ltr'; 

    } catch (error) {
      console.error('Failed to load translations:', error);
    }
  };

  // Setup language toggle buttons if they exist
  window.setLanguage = (lang) => {
    currentLang = lang;
    localStorage.setItem('qz_lang', lang);
    loadTranslations(lang);
    
    // Update active state on buttons
    document.querySelectorAll('.lang-btn').forEach(btn => {
      if(btn.dataset.lang === lang) {
        btn.classList.add('text-aqua', 'font-bold');
        btn.classList.remove('text-gray-400');
      } else {
        btn.classList.remove('text-aqua', 'font-bold');
        btn.classList.add('text-gray-400');
      }
    });
  };

  // Initial load
  loadTranslations(currentLang);
  
  // Make sure correct button is highlighted initially
  setTimeout(() => window.setLanguage(currentLang), 100);
});
