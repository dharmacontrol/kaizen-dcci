"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  LayoutDashboard,
  FileText,
  Users,
  Building2,
  Menu,
  X,
  LogOut,
  Shield,
  CheckCircle,
  Trophy,
  Scale,
  Bell,
  UserCircle,
  Megaphone,
  Settings,
  MessageSquarePlus,
  BookOpen,
  User,
  Newspaper,
  ChevronLeft,
  ChevronRight
} from "lucide-react";

const ADMIN_LINK_NAMES = ["Departments", "Users", "Roles & Permissions"];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isNotificationSettingsOpen, setIsNotificationSettingsOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);
  const { data: session } = useSession();

  useEffect(() => {
    if (session) {
      const fetchNotifications = () => {
        fetch("/api/notifications", { cache: "no-store" })
          .then(res => res.json())
          .then(data => {
            if (Array.isArray(data)) {
              setNotifications(data);
              setUnreadCount(data.filter(n => !n.isRead).length);
            }
          })
          .catch(console.error);
      };

      const fetchCounts = () => {
        fetch("/api/suggestions/counts", { cache: "no-store" })
          .then(res => res.json())
          .then(data => setPendingApprovalsCount(data.pendingApprovals || 0))
          .catch(console.error);
      };

      // Fetch immediately
      fetchNotifications();
      fetchCounts();

      // Poll every 10 seconds
      const intervalId = setInterval(() => {
        fetchNotifications();
        fetchCounts();
      }, 10000);
      return () => clearInterval(intervalId);
    }
  }, [session]);

  const markAllAsRead = async () => {
    try {
      await fetch("/api/notifications", { method: "PATCH" });
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (e) {}
  };

  const markAsRead = async (id: string, link?: string) => {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
      setNotifications(prev => prev.map(n => n._id === id ? { ...n, isRead: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
      if (link) {
        window.location.href = link;
      }
    } catch (e) {}
  };
  const [notifSettings, setNotifSettings] = useState({
    comments: true,
    status: true,
    rewards: true,
    system: false,
    email: true,
  });
  const pathname = usePathname();

  // "/dashboard" is a prefix of every other dashboard route, so it needs an
  // exact match while every other link stays active on its own nested pages.
  const isLinkActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname === href || pathname?.startsWith(href + '/');

  // Navigation Links
  const navLinks = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, show: true },
    { name: "News", href: "/dashboard/news", icon: Newspaper, show: true },
    { name: "Announcements", href: "/dashboard/announcements", icon: Megaphone, show: session?.user?.role === "Admin" },
    { name: "Suggestions", href: "/dashboard/suggestions", icon: FileText, show: session?.user?.permissions?.canViewSuggestions ?? true },
    { name: "Approvals", href: "/dashboard/approvals", icon: CheckCircle, show: session?.user?.permissions?.canManageSuggestions ?? false },
    { name: "Leaderboard", href: "/dashboard/leaderboard", icon: Trophy, show: true },
    { name: "Departments", href: "/dashboard/departments", icon: Building2, show: session?.user?.permissions?.canManageSystem ?? false },
    { name: "Users", href: "/dashboard/users", icon: Users, show: session?.user?.permissions?.canManageSystem ?? false },
    { name: "Roles & Permissions", href: "/dashboard/roles", icon: Shield, show: session?.user?.permissions?.canManageSystem ?? false },
    { name: "Guidance", href: "/dashboard/guidance", icon: BookOpen, show: true },
    { name: "Terms of Service", href: "/dashboard/terms", icon: Scale, show: session?.user?.permissions?.canViewTerms ?? true },
  ]
    .filter(link => link.show)
    .map(link => ({
      ...link,
      badge: link.name === "Approvals" ? pendingApprovalsCount : 0,
    }));

  const mainNavLinks = navLinks.filter(link => !ADMIN_LINK_NAMES.includes(link.name));
  const adminNavLinks = navLinks.filter(link => ADMIN_LINK_NAMES.includes(link.name));

  const canCreateSuggestions = session?.user?.permissions?.canCreateSuggestions ?? true;

  const currentPageTitle = navLinks.find(link => isLinkActive(link.href))?.name || "Dashboard";
  const todayLabel = new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const getInitials = (name?: string | null) =>
    (name || "?").split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

  const renderNavLink = (link: typeof navLinks[number], variant: "desktop" | "mobile") => {
    const isActive = isLinkActive(link.href);
    const compact = variant === "desktop" && !sidebarOpen;
    return (
      <Link
        key={link.name}
        href={link.href}
        onClick={variant === "mobile" ? () => setMobileMenuOpen(false) : undefined}
        className={`relative flex items-center h-10 rounded-xl transition-colors duration-150 ${
          isActive ? "bg-white/10 text-white font-semibold" : "text-slate-400 hover:bg-white/5 hover:text-white"
        } ${compact ? 'justify-center' : 'pl-3 pr-3'}`}
        title={compact ? link.name : undefined}
      >
        <link.icon className={`w-[18px] h-[18px] shrink-0 ${isActive ? "text-white" : "text-slate-500"} ${!compact && 'mr-3'}`} />
        {!compact && <span className="text-sm whitespace-nowrap flex-1">{link.name}</span>}
        {!!link.badge && link.badge > 0 && (
          <span className={`bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center leading-none ${
            compact ? 'absolute top-0.5 right-0.5' : ''
          }`}>
            {link.badge > 99 ? '99+' : link.badge}
          </span>
        )}
      </Link>
    );
  };

  const userIdentityCard = (compact: boolean) => (
    <div className={`flex items-center rounded-xl bg-white/5 ${compact ? 'justify-center py-2.5' : 'gap-3 px-3 py-2.5'}`}>
      <div className="w-9 h-9 rounded-full bg-cyan-500 text-white flex items-center justify-center font-bold text-xs font-display shrink-0">
        {getInitials(session?.user?.name)}
      </div>
      {!compact && (
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">{session?.user?.name || "..."}</p>
          <p className="text-xs text-slate-400 truncate">{session?.user?.role || ""}</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">

      {/* Brand accent strip */}
      <div className="h-1 bg-primary shrink-0" />

      <div className="flex flex-1 flex-col md:flex-row">

      {/*
        ========================================================================
        DESKTOP SIDEBAR
        ========================================================================
      */}
      <aside
        className={`hidden md:flex flex-col relative sticky top-1 h-[calc(100vh-4px)] bg-[#0F172A] shadow-[4px_0_24px_rgba(0,0,0,0.15)] transition-all duration-300 ${sidebarOpen ? 'w-64' : 'w-20'}`}
      >
        {/* Collapse toggle — floats on the sidebar's edge so it works the same collapsed or open */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="hidden md:flex absolute -right-3 top-20 w-6 h-6 rounded-full bg-white border border-gray-200 shadow-md items-center justify-center text-slate-500 hover:text-primary transition-colors z-30"
          title={sidebarOpen ? "Ciutkan menu" : "Lebarkan menu"}
        >
          {sidebarOpen ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>

        <div className={`h-16 flex items-center shrink-0 border-b border-white/10 ${sidebarOpen ? 'px-5 justify-start' : 'px-0 justify-center'}`}>
          <div className={`inline-flex items-center bg-white rounded-xl shadow-md shrink-0 overflow-hidden ${sidebarOpen ? 'px-3.5 py-2.5' : 'w-10 h-10 justify-start pl-2'}`}>
            <Image
              src="/assets/logo.png"
              alt="DCCI"
              width={320}
              height={61}
              className={sidebarOpen ? 'h-6 w-auto' : 'h-7 w-auto'}
            />
          </div>
        </div>

        {/* User identity — the person using the panel, front and center under the logo */}
        <div className={`shrink-0 border-b border-white/10 ${sidebarOpen ? 'px-3 py-3' : 'px-2 py-3'}`}>
          {userIdentityCard(!sidebarOpen)}
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden py-3">
          {canCreateSuggestions && (
            <div className={`px-3 pb-4 ${!sidebarOpen && 'flex justify-center'}`}>
              <Link
                href="/dashboard/suggestions/create"
                className={`flex items-center bg-white rounded-xl shadow-md hover:shadow-lg hover:-translate-y-px transition-all ${
                  sidebarOpen ? 'w-full gap-3 pl-2 pr-4 py-2' : 'w-11 h-11 justify-center'
                }`}
                title={!sidebarOpen ? "Buat Suggestion" : undefined}
              >
                <span className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
                  <MessageSquarePlus className="w-4 h-4 text-white" />
                </span>
                {sidebarOpen && <span className="text-sm font-bold text-primary whitespace-nowrap">Buat Suggestion</span>}
              </Link>
            </div>
          )}

          <nav className="px-3 space-y-0.5">
            {mainNavLinks.map(link => renderNavLink(link, "desktop"))}
          </nav>

          {adminNavLinks.length > 0 && (
            <div className="mt-4">
              {sidebarOpen && (
                <div className="px-4 mb-1.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  Administrasi
                </div>
              )}
              <nav className="px-3 space-y-0.5">
                {adminNavLinks.map(link => renderNavLink(link, "desktop"))}
              </nav>
            </div>
          )}
        </div>

        <div className="p-3 shrink-0">
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className={`w-full flex items-center h-10 rounded-xl text-rose-400 hover:bg-white/5 hover:text-rose-300 transition-colors duration-150 ${sidebarOpen ? 'pl-3 pr-3' : 'justify-center'}`}
            title={!sidebarOpen ? "Sign Out" : undefined}
          >
            <LogOut className={`w-[18px] h-[18px] shrink-0 ${sidebarOpen && 'mr-3'}`} />
            {sidebarOpen && <span className="text-sm whitespace-nowrap">Sign Out</span>}
          </button>
        </div>
      </aside>

      {/*
        ========================================================================
        MAIN CONTENT AREA (HEADER + PAGE CONTENT)
        ========================================================================
      */}
      <div className="flex-1 flex flex-col min-w-0 pb-16 md:pb-0"> {/* pb-16 for mobile bottom nav */}

        {/* TOP HEADER */}
        <header className="sticky top-0 z-20">
          <div className="h-16 bg-white border-b border-gray-100 flex items-center justify-between px-4 sm:px-6">

            <div className="flex items-center gap-3">
              {/* Mobile hamburger — opens the drawer (there's no persistent sidebar on mobile) */}
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-full transition-colors md:hidden"
              >
                <Menu className="w-6 h-6" />
              </button>

              <p className="text-base font-bold text-slate-800 font-display">Suggestion System</p>
            </div>

            {/* Header Right */}
            <div className="flex items-center space-x-3 sm:space-x-4">

              {/* NOTIFICATION WRAPPER */}
              <div className="relative">
                <button
                  onClick={() => setIsNotificationOpen(!isNotificationOpen)}
                  className="p-2 text-gray-400 hover:bg-gray-100 rounded-full transition-colors relative"
                >
                  <Bell className="w-5 h-5 sm:w-6 sm:h-6" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>
                  )}
                </button>

                {/* NOTIFICATION POPOVER */}
                {isNotificationOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsNotificationOpen(false)}></div>
                    <div className="absolute right-0 mt-2 w-[320px] md:w-[380px] bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden flex flex-col max-h-[80vh] animate-in fade-in slide-in-from-top-4 duration-200">

                      {/* Header */}
                      <div className="px-5 py-4 flex items-center justify-between bg-white shrink-0">
                        <h2 className="text-base font-bold text-slate-800 font-display">Notifications</h2>
                        <button onClick={markAllAsRead} className="text-xs font-bold text-slate-500 hover:text-slate-800 underline decoration-slate-300 underline-offset-4">Mark all as read</button>
                      </div>

                      {/* Tabs */}
                      <div className="px-5 flex items-center justify-between border-b border-gray-100 bg-white shrink-0">
                        <div className="flex space-x-6">
                          <button className="py-3 text-sm font-bold text-slate-800 border-b-2 border-slate-800 flex items-center gap-1.5">
                            All {unreadCount > 0 && <span className="bg-slate-800 text-white text-[10px] px-1.5 py-0.5 rounded-md leading-none">{unreadCount}</span>}
                          </button>
                        </div>
                        <button
                          onClick={() => setIsNotificationSettingsOpen(true)}
                          className="text-gray-400 hover:text-slate-600"
                        >
                          <Settings className="w-4 h-4" />
                        </button>
                      </div>

                      {/* List */}
                      <div className="flex-1 overflow-y-auto">
                        {notifications.length === 0 ? (
                          <div className="p-8 text-center text-sm text-gray-500">Belum ada notifikasi.</div>
                        ) : (
                          notifications.map((notif: any) => (
                            <div
                              key={notif._id}
                              onClick={() => markAsRead(notif._id, notif.link)}
                              className={`p-4 border-b border-gray-50 cursor-pointer transition-colors flex gap-3 ${
                                !notif.isRead ? "bg-orange-50/40 hover:bg-orange-50/60" : "bg-white hover:bg-gray-50"
                              }`}
                            >
                              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-xl shrink-0 ${
                                notif.type === "SUCCESS" ? "bg-emerald-100 text-emerald-600" :
                                notif.type === "WARNING" ? "bg-red-100 text-red-600" :
                                notif.type === "ACTION" ? "bg-orange-100 text-orange-600" :
                                "bg-blue-100 text-blue-600"
                              }`}>
                                {notif.type === "SUCCESS" ? "🎉" : notif.type === "WARNING" ? "⚠️" : notif.type === "ACTION" ? "🔔" : "ℹ️"}
                              </div>
                              <div className="flex-1 pt-0.5">
                                <p className="text-sm text-slate-700 leading-snug" dangerouslySetInnerHTML={{ __html: notif.message }}></p>
                                <p className="text-xs text-gray-400 mt-1">{new Date(notif.createdAt).toLocaleString("id-ID")}</p>
                              </div>
                              {!notif.isRead && (
                                <div className="w-2 h-2 rounded-full bg-orange-500 self-center"></div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <Link href="/dashboard/profile" className="flex items-center group">
                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-indigo-100 to-indigo-50 border border-primary/20 flex items-center justify-center overflow-hidden shadow-sm group-hover:border-primary/40 transition-colors">
                  <span className="text-primary font-bold text-sm font-display uppercase">
                    {session?.user?.name ? session.user.name.substring(0, 2) : "US"}
                  </span>
                </div>
              </Link>
            </div>
          </div>

          {/* Page context bar */}
          <div className="h-11 bg-white border-b border-gray-100 flex items-center justify-between px-4 sm:px-6 text-xs sm:text-sm">
            <span className="font-semibold text-slate-600">{currentPageTitle}</span>
            <span className="text-gray-400">{todayLabel}</span>
          </div>
        </header>

        {/* PAGE CONTENT */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-slate-50 p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>

      </div>

      {/*
        ========================================================================
        MOBILE BOTTOM NAVIGATION (Fixed at bottom)
        ========================================================================
      */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-gray-200 z-30 px-2 pb-safe shadow-[0_-4px_10px_rgba(0,0,0,0.02)]">
        <div className="flex items-center justify-between h-full relative">

          {/* Slot 1: Dashboard */}
          <Link
            href="/dashboard"
            className={`flex-1 flex flex-col items-center justify-center h-full transition-colors ${pathname === '/dashboard' ? 'text-primary' : 'text-gray-400 hover:text-primary'}`}
          >
            <LayoutDashboard className="w-5 h-5" />
            {pathname === '/dashboard' && <span className="w-1 h-1 bg-primary rounded-full mt-1"></span>}
          </Link>

          {/* Slot 2: Suggestions */}
          <Link
            href="/dashboard/suggestions"
            className={`flex-1 flex flex-col items-center justify-center h-full transition-colors ${pathname?.includes('/suggestions') && pathname !== '/dashboard/suggestions/create' ? 'text-primary' : 'text-gray-400 hover:text-primary'}`}
          >
            <FileText className="w-5 h-5" />
            {pathname?.includes('/suggestions') && pathname !== '/dashboard/suggestions/create' && <span className="w-1 h-1 bg-primary rounded-full mt-1"></span>}
          </Link>

          {/* Slot 3: Center FAB (Create Suggestion) */}
          <div className="flex-1 flex justify-center relative h-full pointer-events-none">
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 pointer-events-auto z-40">
              <Link
                href="/dashboard/suggestions/create"
                className="w-14 h-14 bg-primary text-white rounded-full flex items-center justify-center shadow-lg shadow-primary/30 border-[6px] border-slate-50 hover:bg-primary/90 transition-transform hover:scale-105 active:scale-95"
              >
                <MessageSquarePlus className="w-6 h-6" />
              </Link>
            </div>
          </div>

          {/* Slot 4: Guidance */}
          <Link
            href="/dashboard/guidance"
            className={`flex-1 flex flex-col items-center justify-center h-full transition-colors ${pathname?.includes('/guidance') ? 'text-primary' : 'text-gray-400 hover:text-primary'}`}
          >
            <BookOpen className="w-5 h-5" />
            {pathname?.includes('/guidance') && <span className="w-1 h-1 bg-primary rounded-full mt-1"></span>}
          </Link>

          {/* Slot 5: Profile */}
          <Link
            href="/dashboard/profile"
            className={`flex-1 flex flex-col items-center justify-center h-full transition-colors ${pathname?.includes('/profile') ? 'text-primary' : 'text-gray-400 hover:text-primary'}`}
          >
            <User className="w-5 h-5" />
            {pathname?.includes('/profile') && <span className="w-1 h-1 bg-primary rounded-full mt-1"></span>}
          </Link>
        </div>
      </nav>

      {/*
        ========================================================================
        MOBILE SIDE DRAWER MENU (Opened via top header Menu button)
        ========================================================================
      */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-[9999] flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          ></div>

          {/* Drawer */}
          <div className="relative w-72 max-w-[80vw] h-full bg-[#0F172A] shadow-2xl flex flex-col animate-in slide-in-from-left duration-300">

            {/* Drawer Header */}
            <div className="h-16 flex items-center justify-between px-5 border-b border-white/10 shrink-0">
              <div className="inline-flex items-center bg-white rounded-xl shadow-md px-3.5 py-2.5 shrink-0">
                <Image src="/assets/logo.png" alt="DCCI" width={320} height={61} className="h-6 w-auto" />
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 bg-white/10 text-slate-400 hover:text-white rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* User identity */}
            <div className="px-3 py-3 border-b border-white/10 shrink-0">
              {userIdentityCard(false)}
            </div>

            {/* Create Suggestion CTA */}
            {canCreateSuggestions && (
              <div className="px-3 pt-4">
                <Link
                  href="/dashboard/suggestions/create"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 bg-white rounded-xl shadow-md pl-2 pr-4 py-2 w-full"
                >
                  <span className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
                    <MessageSquarePlus className="w-4 h-4 text-white" />
                  </span>
                  <span className="text-sm font-bold text-primary">Buat Suggestion</span>
                </Link>
              </div>
            )}

            {/* Drawer Links */}
            <div className="flex-1 overflow-y-auto py-3">
              <nav className="px-3 space-y-0.5">
                {mainNavLinks.map(link => renderNavLink(link, "mobile"))}
              </nav>

              {adminNavLinks.length > 0 && (
                <div className="mt-4">
                  <div className="px-4 mb-1.5 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Administrasi
                  </div>
                  <nav className="px-3 space-y-0.5">
                    {adminNavLinks.map(link => renderNavLink(link, "mobile"))}
                  </nav>
                </div>
              )}
            </div>

            {/* Drawer Bottom Actions */}
            <div className="p-3 shrink-0">
              <button
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="w-full flex items-center h-11 pl-3 pr-3 rounded-xl text-rose-400 hover:bg-white/5 hover:text-rose-300 transition-colors duration-150"
              >
                <LogOut className="w-[18px] h-[18px] mr-3 shrink-0" />
                <span className="text-sm">Sign Out</span>
              </button>
            </div>

          </div>
        </div>
      )}



      {/*
        ========================================================================
        NOTIFICATION SETTINGS MODAL
        ========================================================================
      */}
      {isNotificationSettingsOpen && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setIsNotificationSettingsOpen(false)}
          ></div>
          <div className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-white">
              <h2 className="text-lg font-bold text-slate-800 font-display">Notification Preferences</h2>
              <button
                onClick={() => setIsNotificationSettingsOpen(false)}
                className="p-2 text-gray-400 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
              <div className="space-y-6">

                <div>
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4">Categories</h3>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-slate-700">New Comments</p>
                        <p className="text-xs text-gray-500 mt-0.5">When someone comments on your suggestion</p>
                      </div>
                      <button
                        onClick={() => setNotifSettings({...notifSettings, comments: !notifSettings.comments})}
                        className={`w-11 h-6 rounded-full transition-colors relative flex items-center shrink-0 ${notifSettings.comments ? 'bg-primary' : 'bg-gray-200'}`}
                      >
                        <span className={`w-5 h-5 bg-white rounded-full transition-transform absolute shadow-sm ${notifSettings.comments ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-slate-700">Status Changes</p>
                        <p className="text-xs text-gray-500 mt-0.5">When your suggestion is approved/rejected</p>
                      </div>
                      <button
                        onClick={() => setNotifSettings({...notifSettings, status: !notifSettings.status})}
                        className={`w-11 h-6 rounded-full transition-colors relative flex items-center shrink-0 ${notifSettings.status ? 'bg-primary' : 'bg-gray-200'}`}
                      >
                        <span className={`w-5 h-5 bg-white rounded-full transition-transform absolute shadow-sm ${notifSettings.status ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-slate-700">Reward Points</p>
                        <p className="text-xs text-gray-500 mt-0.5">When you receive bonus points</p>
                      </div>
                      <button
                        onClick={() => setNotifSettings({...notifSettings, rewards: !notifSettings.rewards})}
                        className={`w-11 h-6 rounded-full transition-colors relative flex items-center shrink-0 ${notifSettings.rewards ? 'bg-primary' : 'bg-gray-200'}`}
                      >
                        <span className={`w-5 h-5 bg-white rounded-full transition-transform absolute shadow-sm ${notifSettings.rewards ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-slate-700">System Announcements</p>
                        <p className="text-xs text-gray-500 mt-0.5">Maintenance and general updates</p>
                      </div>
                      <button
                        onClick={() => setNotifSettings({...notifSettings, system: !notifSettings.system})}
                        className={`w-11 h-6 rounded-full transition-colors relative flex items-center shrink-0 ${notifSettings.system ? 'bg-primary' : 'bg-gray-200'}`}
                      >
                        <span className={`w-5 h-5 bg-white rounded-full transition-transform absolute shadow-sm ${notifSettings.system ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-100">
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4">Delivery</h3>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-slate-700">Email Notifications</p>
                      <p className="text-xs text-gray-500 mt-0.5">Receive urgent notifications via email</p>
                    </div>
                    <button
                      onClick={() => setNotifSettings({...notifSettings, email: !notifSettings.email})}
                      className={`w-11 h-6 rounded-full transition-colors relative flex items-center shrink-0 ${notifSettings.email ? 'bg-primary' : 'bg-gray-200'}`}
                    >
                      <span className={`w-5 h-5 bg-white rounded-full transition-transform absolute shadow-sm ${notifSettings.email ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                </div>

              </div>
            </div>

            <div className="p-5 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
              <button
                onClick={() => setIsNotificationSettingsOpen(false)}
                className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => setIsNotificationSettingsOpen(false)}
                className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-blue-700 transition-colors shadow-sm"
              >
                Save Preferences
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
