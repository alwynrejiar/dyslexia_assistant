import React, { useState } from "https://esm.sh/react@19.2.0";
import { createRoot } from "https://esm.sh/react-dom@19.2.0/client";
import htm from "https://esm.sh/htm@3.1.1";
import { Globe, Mail, Link, ArrowUpRight } from "https://esm.sh/lucide-react@1.7.0";

const html = htm.bind(React.createElement);

function SocialButton({ item, hoveredItem, setHoveredItem }) {
  const Icon = item.icon;
  return html`
    <div className="profile-react-social-wrap">
      <a
        href="#"
        className="profile-react-social"
        aria-label=${item.label}
        onMouseEnter=${() => setHoveredItem(item.id)}
        onMouseLeave=${() => setHoveredItem(null)}
        onClick=${(e) => e.preventDefault()}
      >
        <${Icon} size=${18} />
      </a>
      <div className=${`profile-react-tooltip ${hoveredItem === item.id ? "is-visible" : ""}`}>
        ${item.label}
      </div>
    </div>
  `;
}

function ProfileCard() {
  const [hoveredItem, setHoveredItem] = useState(null);
  const socialLinks = [
    { id: "portfolio", icon: Globe, label: "Portfolio" },
    { id: "mail", icon: Mail, label: "Email" },
    { id: "website", icon: Link, label: "Website" },
  ];

  return html`
    <article className="profile-react-card-shell">
      <div className="profile-react-card">
        <div className="profile-react-avatar-wrap">
          <img
            src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=240&q=80"
            alt="Ravi Katiyar avatar"
            className="profile-react-avatar"
          />
        </div>

        <h4 className="profile-react-name">Ravi Katiyar</h4>
        <p className="profile-react-role">Sr. Designer</p>
        <p className="profile-react-bio">
          Building beautiful and intuitive digital experiences. Passionate about design systems and web animation.
        </p>

        <div className="profile-react-divider"></div>

        <div className="profile-react-social-row">
          ${socialLinks.map(
            (item) => html`<${SocialButton} key=${item.id} item=${item} hoveredItem=${hoveredItem} setHoveredItem=${setHoveredItem} />`
          )}
        </div>

        <a href="#" className="profile-react-cta" onClick=${(e) => e.preventDefault()}>
          <span>Contact Me</span>
          <${ArrowUpRight} size=${15} />
        </a>
      </div>
      <div className="profile-react-glow"></div>
    </article>
  `;
}

const mountNode = document.getElementById("profileCardReactMount");
if (mountNode) {
  createRoot(mountNode).render(html`<${ProfileCard} />`);
}
