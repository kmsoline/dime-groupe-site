import { NextRequest, NextResponse } from "next/server";
import { checkAdminRole } from "@/lib/api-auth";
import { dbInsert, setContentSetting } from "@/lib/db";

export async function POST(request: NextRequest) {
  if (!(await checkAdminRole())) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  try {
    const MAX_BODY = 2 * 1024 * 1024;
    const MAX_ARRAY = 500;
    const bodyText = await request.text();
    if (bodyText.length > MAX_BODY) {
      return NextResponse.json({ error: "Payload trop volumineux" }, { status: 413 });
    }
    const data = JSON.parse(bodyText);
    const { type } = data;
    const imported: string[] = [];

    // ── Blog ──────────────────────────────────────────────────────────────────
    if ((type === "all" || type === "blog") && Array.isArray(data.blogPosts)) {
      for (const post of data.blogPosts.slice(0, MAX_ARRAY)) {
        try {
          await dbInsert("blog_articles", {
            slug: post.slug, title: post.title, excerpt: post.excerpt,
            content: post.content, category: post.category, date: post.date,
            read_time: post.read_time || post.readTime, img: post.img,
            published: post.published ?? post.status === "published",
          });
        } catch { /* ignore les doublons */ }
      }
      imported.push("blog");
    }

    // ── Portfolio ─────────────────────────────────────────────────────────────
    if ((type === "all" || type === "portfolio") && Array.isArray(data.portfolioItems)) {
      for (const item of data.portfolioItems.slice(0, MAX_ARRAY)) {
        try {
          await dbInsert("portfolio_items", {
            slug: item.slug, title: item.title, description: item.description,
            category: item.category, img: item.img || item.imageUrl,
            client: item.client || "", year: item.year || new Date().getFullYear(),
            url: item.url || "", published: item.published ?? item.active ?? true,
          });
        } catch { /* ignore les doublons */ }
      }
      imported.push("portfolio");
    }

    // ── Services ──────────────────────────────────────────────────────────────
    if ((type === "all" || type === "services") && Array.isArray(data.services)) {
      for (const svc of data.services.slice(0, MAX_ARRAY)) {
        try {
          await dbInsert("services", {
            slug: svc.slug, title: svc.title, excerpt: svc.excerpt || svc.description,
            description: svc.description, icon: svc.icon || "", img: svc.img || "",
            category: svc.category || "", active: svc.active ?? true,
          });
        } catch { /* ignore les doublons */ }
      }
      imported.push("services");
    }

    // ── FAQ ───────────────────────────────────────────────────────────────────
    if ((type === "all" || type === "faq") && Array.isArray(data.faqItems)) {
      for (const item of data.faqItems.slice(0, MAX_ARRAY)) {
        try {
          await dbInsert("faq_items", {
            question: item.question, answer: item.answer,
            category: item.category || "Général",
            active: item.active ?? true,
            sort_order: item.sort_order ?? item.order ?? 0,
          });
        } catch { /* ignore les doublons */ }
      }
      imported.push("faq");
    }

    // ── Témoignages ───────────────────────────────────────────────────────────
    if ((type === "all" || type === "testimonials") && Array.isArray(data.testimonials)) {
      for (const t of data.testimonials.slice(0, MAX_ARRAY)) {
        try {
          await dbInsert("testimonials", {
            name: t.name, role: t.role || "", company: t.company || "",
            text: t.text, rating: t.rating ?? 5,
            active: t.active ?? true, sort_order: t.sort_order ?? t.order ?? 0,
          });
        } catch { /* ignore les doublons */ }
      }
      imported.push("testimonials");
    }

    // ── Logos clients ─────────────────────────────────────────────────────────
    if ((type === "all" || type === "client-logos") && Array.isArray(data.clientLogos)) {
      for (const logo of data.clientLogos.slice(0, MAX_ARRAY)) {
        try {
          await dbInsert("client_logos", {
            name: logo.name, logo_url: logo.logo_url || logo.logoUrl,
            website_url: logo.website_url || logo.website || "",
            active: logo.active ?? true, sort_order: logo.sort_order ?? logo.order ?? 0,
          });
        } catch { /* ignore les doublons */ }
      }
      imported.push("client-logos");
    }

    // ── Contenu page_content (homepage, about, legal, metadata, navigation, afrinomade) ──
    const contentMappings: Array<[string, string, unknown]> = [
      ["homepage", "homepage_content", data.homePageContent],
      ["about", "about_content", data.aboutPageContent],
      ["legal", "legal_pages", data.legalPages],
      ["metadata", "page_metadata", data.pageMetadata],
      ["afrinomade", "afrinomade_content", data.afriNomadeContent],
    ];

    for (const [section, key, value] of contentMappings) {
      if ((type === "all" || type === section) && value) {
        await setContentSetting(key, value);
        imported.push(section);
      }
    }

    if ((type === "all" || type === "navigation") && data.navigation) {
      if (data.navigation.headerLinks) await setContentSetting("nav_header", data.navigation.headerLinks);
      if (data.navigation.footerSections) await setContentSetting("nav_footer", data.navigation.footerSections);
      if (data.navigation.siteLogo) await setContentSetting("nav_logo", data.navigation.siteLogo);
      imported.push("navigation");
    }

    return NextResponse.json({
      success: true,
      message: `Données importées avec succès : ${imported.join(", ") || "aucune donnée"}`,
    });
  } catch {
    return NextResponse.json({ error: "Erreur lors de l'import" }, { status: 500 });
  }
}
