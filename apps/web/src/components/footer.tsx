'use client';

import { useAuthModalControl } from '@/context/auth-modal-control';

export default function Footer() {
  const currentYear = new Date().getFullYear();
  const { openJoinModal, openLoginModal } = useAuthModalControl();

  return (
    <footer className="border-t border-slate-200 bg-slate-900 text-slate-300 mt-16">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          {/* Brand */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white">Fitout Hub</h3>
            <p className="text-sm">
              Connect with trusted professionals and manage your fitout projects seamlessly.
            </p>
          </div>

          {/* Browse */}
          <div className="space-y-4">
            <h4 className="font-semibold text-white">Browse</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="/professionals" className="hover:text-white transition">Professionals</a></li>
              <li><a href="/tradesmen" className="hover:text-white transition">Tradesmen</a></li>
            </ul>
          </div>

          {/* For Clients */}
          <div className="space-y-4">
            <h4 className="font-semibold text-white">For Clients</h4>
            <ul className="space-y-2 text-sm">
              <li><button onClick={openJoinModal} className="hover:text-white transition text-left">Get Started</button></li>
              <li><a href="/create-project" className="hover:text-white transition">Create Project</a></li>
            </ul>
          </div>

          {/* Account */}
          <div className="space-y-4">
            <h4 className="font-semibold text-white">Account</h4>
            <ul className="space-y-2 text-sm">
              <li><button onClick={openLoginModal} className="hover:text-white transition text-left">Login</button></li>
              <li><button onClick={openJoinModal} className="hover:text-white transition text-left">Join</button></li>
            </ul>
          </div>
        </div>

        <div className="mt-8 border-t border-slate-700 pt-8 flex flex-col md:flex-row justify-between items-center text-sm">
          <p>&copy; {currentYear} Fitout Hub. All rights reserved.</p>
          <div className="flex gap-6 mt-4 md:mt-0">
            <a href="#" className="hover:text-white transition">Twitter</a>
            <a href="#" className="hover:text-white transition">LinkedIn</a>
            <a href="#" className="hover:text-white transition">Instagram</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
