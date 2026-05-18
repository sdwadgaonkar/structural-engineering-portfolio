// ============ Shared site components ============
// Single source of truth for the navbar and footer.
// Each page calls renderNavbar('pagename') and renderFooter() to inject these.

// The list of nav items. Add a new entry here once and every page picks it up.
const NAV_ITEMS = [
    { id: 'home',     label: 'Home',     href: 'index.html' },
    { id: 'tools',    label: 'Tools',    href: 'tools.html' },
    { id: 'blog',     label: 'Blog',     href: 'blog.html' },
    { id: 'projects', label: 'Projects', href: 'projects.html' },
    { id: 'about',    label: 'About',    href: 'about.html' },
    { id: 'contact',  label: 'Contact',  href: 'contact.html' }
];

// Pages inside subfolders (like tools/beam-calculator.html) need "../" prefixed
// to every nav link. We detect the depth from the script's data attribute.
function getPathPrefix() {
    const script = document.currentScript || document.querySelector('script[src*="components.js"]');
    const depth = script && script.dataset.depth ? parseInt(script.dataset.depth) : 0;
    return '../'.repeat(depth);
}

function renderNavbar(activeId) {
    const prefix = getPathPrefix();
    const links = NAV_ITEMS.map(item => `
        <li><a href="${prefix}${item.href}"${item.id === activeId ? ' class="active"' : ''}>${item.label}</a></li>
    `).join('');

    const html = `
        <nav class="navbar">
            <a href="${prefix}index.html" class="logo">StruxLab</a>
            <ul class="nav-links">${links}</ul>
        </nav>
    `;
    document.getElementById('site-navbar').innerHTML = html;
}

function renderFooter() {
    const html = `
        <footer class="footer">
            <div class="footer-content">
                <span class="footer-brand">StruxLab</span>
                <p>© 2026 Sanket Wadgaonkar · Pune, India</p>
            </div>
        </footer>
    `;
    document.getElementById('site-footer').innerHTML = html;
}