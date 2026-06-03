export const JOB_CATEGORY_MAP = {
  "Mobile & Web Development": {
    keywords: [
      "web", "website", "frontend", "backend", "fullstack", "full stack",
      "react", "angular", "vue", "nextjs", "nodejs", "express", "php",
      "laravel", "django", "flask", "html", "css", "javascript",
      "typescript", "wordpress", "ecommerce", "shopify", "woocommerce",
      "mobile", "android", "ios", "flutter", "react native", "swift",
      "kotlin", "app", "pwa", "api", "rest api", "graphql", "mern",
      "mean", "jamstack", "web app", "web development", "mobile app",
    ],
  },

  "DevOps": {
    keywords: [
      "devops", "docker", "kubernetes", "ci/cd", "jenkins", "aws",
      "azure", "google cloud", "gcp", "terraform", "ansible", "linux",
      "server", "deployment", "cloud", "infrastructure", "nginx",
      "apache", "pipeline", "git", "github actions", "gitlab",
      "monitoring", "logging", "security", "networking", "vpc",
      "database admin", "postgresql", "mysql", "mongodb admin",
    ],
  },

  "Design": {
    keywords: [
      "design", "ui", "ux", "ui/ux", "figma", "photoshop", "illustrator",
      "logo", "branding", "graphic", "banner", "poster", "flyer",
      "wireframe", "prototype", "mockup", "adobe xd", "sketch",
      "canva", "animation", "motion", "video editing", "premiere",
      "after effects", "3d", "blender", "product design", "packaging",
      "illustration", "icon", "infographic", "social media design",
      "presentation", "pitch deck", "typography",
    ],
  },

  "Data Entry": {
    keywords: [
      "data entry", "typing", "copy paste", "excel", "spreadsheet",
      "google sheets", "data collection", "web scraping", "scraping",
      "data cleaning", "data formatting", "pdf to excel", "word to excel",
      "database entry", "form filling", "catalog", "product listing",
      "ecommerce listing", "data processing", "transcription",
      "document conversion", "data migration",
    ],
  },

  "Virtual Assistant": {
    keywords: [
      "virtual assistant", "va", "admin", "administrative", "calendar",
      "scheduling", "email management", "customer support", "chat support",
      "research", "market research", "lead generation", "crm",
      "project management", "trello", "asana", "notion", "clickup",
      "personal assistant", "executive assistant", "bookkeeping",
      "accounting", "invoicing", "data research", "linkedin outreach",
      "cold email", "appointment setting",
    ],
  },

  "Content Writing": {
    keywords: [
      "content", "writing", "writer", "blog", "article", "copywriting",
      "copy", "seo writing", "seo content", "ghostwriting", "ghostwriter",
      "proofreading", "editing", "technical writing", "creative writing",
      "social media content", "caption", "script", "video script",
      "product description", "website copy", "email copy", "newsletter",
      "press release", "resume writing", "cover letter", "academic writing",
      "translation", "localization", "content strategy",
    ],
  },
};

// ─── Search query / title se matching categories nikalo ──────────────────────
export const getMatchingJobCategories = (text) => {
  if (!text) return [];
  const q = text.toLowerCase().trim();
  const matched = [];

  for (const [catName, data] of Object.entries(JOB_CATEGORY_MAP)) {
    const isMatch = data.keywords.some(
      (kw) => q.includes(kw) || kw.includes(q)
    );
    if (isMatch) matched.push(catName);
  }

  return matched;
};

// ─── Category filter ke liye — selected category ke keywords return karo ─────
export const getKeywordsForCategory = (category) => {
  return JOB_CATEGORY_MAP[category]?.keywords || [];
};