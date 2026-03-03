'use client';

interface SearchHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SearchHelpModal({ isOpen, onClose }: SearchHelpModalProps) {
  if (!isOpen) return null;

  const examples = [
    {
      title: 'For Clients',
      items: [
        '"I need a plumber to fix a leaky tap in my kitchen sink"',
        '"Rewire my entire apartment in Mong Kok"',
        '"Interior design for my living room"',
        '"Paint my bedroom walls and ceiling"',
      ],
    },
    {
      title: 'For Professionals',
      items: [
        '"Join as a plumber"',
        '"Register as an electrician"',
        '"I want to offer my services as a contractor"',
        '"Join as a designer"',
      ],
    },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 sm:p-8 space-y-6 animate-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-slate-900">How to Get Started</h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 text-2xl leading-none"
            >
              ×
            </button>
          </div>
          <p className="text-sm text-slate-600">
            Just describe what you need, and we'll understand your intent. Here are some examples:
          </p>
        </div>

        {/* Examples */}
        <div className="space-y-6">
          {examples.map((section, idx) => (
            <div key={idx} className="space-y-3">
              <h3 className="font-semibold text-slate-900 text-sm uppercase tracking-wide text-emerald-700">
                {section.title}
              </h3>
              <ul className="space-y-2">
                {section.items.map((item, itemIdx) => (
                  <li key={itemIdx} className="flex items-start gap-3 text-sm text-slate-700">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0" />
                    <span className="italic text-slate-600">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Tips */}
        <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-200 space-y-2">
          <h3 className="font-semibold text-emerald-900 text-sm">Tips for best results:</h3>
          <ul className="space-y-1 text-sm text-emerald-800">
            <li>• Include what you need done</li>
            <li>• Mention your location if relevant</li>
            <li>• Be specific about your profession if joining</li>
          </ul>
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="w-full px-4 py-2.5 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 transition"
        >
          Got it, let's start
        </button>
      </div>
    </div>
  );
}
