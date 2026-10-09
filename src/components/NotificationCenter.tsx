import React, { useState, useEffect, useRef } from 'react';
import {
  Bell,
  CheckCheck,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Ban,
  FileText,
  RefreshCw,
} from 'lucide-react';
import { apiFetch, getActiveRole } from '../lib/api.ts';
import { formatDateTime } from '../utils/dateFormat.ts';
import { NotificationDto, NotificationType } from '../types/leave.ts';
import { Employee360Link } from './Employee360Trigger.tsx';

interface NotificationCenterProps {
  onNavigateToRequest?: (requestId: number) => void;
}

export function NotificationCenter({ onNavigateToRequest }: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationDto[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const activeRole = getActiveRole();

  const fetchNotifications = async () => {
    try {
      const res = await apiFetch('/api/notifications?limit=25');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch {}
  };

  useEffect(() => {
    fetchNotifications();
    // Poll notifications every 30 seconds
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [activeRole]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggle = () => {
    if (!isOpen) {
      fetchNotifications();
    }
    setIsOpen(!isOpen);
  };

  const handleMarkAsRead = async (id: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const res = await apiFetch(`/api/notifications/${id}/read`, { method: 'POST' });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch {}
  };

  const handleMarkAllAsRead = async () => {
    setMarkingAll(true);
    try {
      const res = await apiFetch('/api/notifications/read-all', { method: 'POST' });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
        setUnreadCount(0);
      }
    } catch {
    } finally {
      setMarkingAll(false);
    }
  };

  const getNotificationIcon = (type: NotificationType) => {
    switch (type) {
      case 'LEAVE_SUBMITTED':
        return <Calendar className="w-4 h-4 text-sky-600 shrink-0" />;
      case 'TEAM_LEADER_DECIDED':
        return <Clock className="w-4 h-4 text-teal-600 shrink-0" />;
      case 'HR_DECIDED':
        return <Clock className="w-4 h-4 text-purple-600 shrink-0" />;
      case 'FINAL_APPROVED':
        return <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />;
      case 'FINAL_REJECTED':
        return <XCircle className="w-4 h-4 text-rose-600 shrink-0" />;
      case 'LEAVE_CANCELLED':
        return <Ban className="w-4 h-4 text-amber-600 shrink-0" />;
      default:
        return <FileText className="w-4 h-4 text-neutral-600 shrink-0" />;
    }
  };

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        id="btn-notification-bell"
        onClick={handleToggle}
        aria-label="Notifications"
        className="relative min-h-[44px] min-w-[44px] inline-flex items-center justify-center p-2 rounded-xl text-neutral-200 hover:text-white hover:bg-white/10 active:bg-white/15 transition-colors cursor-pointer"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span
            id="notification-unread-badge"
            className="absolute top-1.5 right-1.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-700 rounded-full ring-2 ring-white"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel (Mobile viewport safe from 320px-430px + Desktop anchored) */}
      {isOpen && (
        <div
          id="notification-dropdown-panel"
          className="fixed left-3 right-3 top-16 sm:left-auto sm:right-0 sm:top-auto sm:absolute sm:mt-2 sm:w-96 max-w-[calc(100vw-1.5rem)] bg-white rounded-xl shadow-xl border border-sky-200 border-t-[5px] border-t-sky-600 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-sky-200 bg-sky-50/90">
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs text-sky-950">Notifications</span>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {unreadCount > 0 && (
                <button
                  id="btn-mark-all-read"
                  onClick={handleMarkAllAsRead}
                  disabled={markingAll}
                  className="min-h-[44px] sm:min-h-[36px] px-2.5 rounded-xl inline-flex items-center gap-1 text-xs sm:text-[11px] text-red-700 hover:text-red-800 hover:bg-red-50 font-semibold cursor-pointer"
                >
                  <CheckCheck className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                  <span>Mark all read</span>
                </button>
              )}
              <button
                onClick={fetchNotifications}
                className="min-h-[44px] min-w-[44px] sm:min-h-[36px] sm:min-w-[36px] inline-flex items-center justify-center p-2 text-neutral-500 hover:text-red-700 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                title="Refresh"
              >
                <RefreshCw className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
              </button>
            </div>
          </div>

          {/* Body List */}
          <div className="max-h-96 overflow-y-auto divide-y divide-neutral-100">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-neutral-500">
                <Bell className="w-8 h-8 mx-auto mb-2 text-neutral-300" />
                <p className="text-xs font-medium text-neutral-600">No notifications</p>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  You're all caught up with leave updates.
                </p>
              </div>
            ) : (
              notifications.map((notif) => {
                const notifTint =
                  notif.type === 'FINAL_APPROVED'
                    ? 'bg-emerald-50/75 hover:bg-emerald-100/70 border-l-4 border-l-emerald-500'
                    : notif.type === 'FINAL_REJECTED'
                      ? 'bg-rose-50/75 hover:bg-rose-100/70 border-l-4 border-l-rose-500'
                      : notif.type === 'TEAM_LEADER_DECIDED'
                        ? 'bg-teal-50/75 hover:bg-teal-100/70 border-l-4 border-l-teal-500'
                        : notif.type === 'HR_DECIDED'
                          ? 'bg-purple-50/75 hover:bg-purple-100/70 border-l-4 border-l-purple-500'
                          : notif.type === 'LEAVE_CANCELLED'
                            ? 'bg-stone-100/80 hover:bg-stone-200/60 border-l-4 border-l-stone-500'
                            : 'bg-sky-50/75 hover:bg-sky-100/70 border-l-4 border-l-sky-500';
                return (
                <div
                  key={notif.id}
                  id={`notification-item-${notif.id}`}
                  onClick={() => {
                    if (!notif.isRead) handleMarkAsRead(notif.id);
                    if (notif.relatedLeaveRequestId && onNavigateToRequest) {
                      onNavigateToRequest(notif.relatedLeaveRequestId);
                      setIsOpen(false);
                    }
                  }}
                  className={`p-3.5 flex items-start gap-3 transition-colors cursor-pointer ${
                    notif.isRead
                      ? 'bg-slate-50/50 hover:bg-slate-100/70'
                      : notifTint
                  }`}
                >
                  <div className="mt-0.5 p-1.5 rounded-lg bg-white border border-neutral-200/80 shadow-2xs">
                    {getNotificationIcon(notif.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <h4
                        className={`text-xs font-semibold leading-snug truncate ${
                          notif.isRead ? 'text-neutral-800' : 'text-neutral-950 font-bold'
                        }`}
                      >
                        {notif.title}
                      </h4>
                      {!notif.isRead && (
                        <span className="w-2 h-2 rounded-full bg-red-700 shrink-0" />
                      )}
                    </div>
                    <p className="text-[11px] text-neutral-600 mt-1 leading-relaxed line-clamp-2">
                      {notif.message}
                    </p>
                    <div className="flex items-center justify-between mt-2 pt-1 border-t border-neutral-100/60 text-[10px] text-neutral-500">
                      <div className="flex items-center gap-2">
                        <span>
                          {formatDateTime(notif.createdAt)}
                        </span>
                        {notif.recipientEmployeeCode && (
                          <span onClick={(e) => e.stopPropagation()}>
                            <Employee360Link
                              employeeCode={notif.recipientEmployeeCode}
                              employeeId={notif.recipientEmployeeId}
                              variant="badge"
                            />
                          </span>
                        )}
                      </div>
                      {!notif.isRead && (
                        <button
                          onClick={(e) => handleMarkAsRead(notif.id, e)}
                          className="min-h-[36px] px-2 rounded-lg text-red-700 hover:text-red-800 hover:bg-red-50 font-semibold cursor-pointer inline-flex items-center"
                        >
                          Mark as read
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
