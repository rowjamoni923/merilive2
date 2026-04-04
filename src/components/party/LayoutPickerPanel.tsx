import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, Grid2X2, LayoutGrid, Rows, Columns } from "lucide-react";
import { cn } from "@/lib/utils";

interface LayoutPickerPanelProps {
  isOpen: boolean;
  onClose: () => void;
  currentLayout?: string;
  onSelectLayout: (layout: string) => void;
  maxSeats?: number;
}

// Layout options for party rooms
const layouts = [
  { 
    id: 'grid-2x2', 
    name: '2x2 Grid', 
    icon: Grid2X2,
    description: '4 seats in a grid',
    seats: 4 
  },
  { 
    id: 'grid-3x2', 
    name: '3x2 Grid', 
    icon: LayoutGrid,
    description: '6 seats in a grid',
    seats: 6 
  },
  { 
    id: 'row-4', 
    name: 'Single Row', 
    icon: Rows,
    description: '4 seats in a row',
    seats: 4 
  },
  { 
    id: 'columns-2', 
    name: 'Two Columns', 
    icon: Columns,
    description: '2 columns layout',
    seats: 4 
  },
];

export function LayoutPickerPanel({
  isOpen,
  onClose,
  currentLayout = 'grid-2x2',
  onSelectLayout,
  maxSeats = 4
}: LayoutPickerPanelProps) {
  const [selectedId, setSelectedId] = useState(currentLayout);

  const handleSelect = (layout: typeof layouts[0]) => {
    setSelectedId(layout.id);
    onSelectLayout(layout.id);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900">Choose Layout</h3>
              <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Layout Options */}
            <div className="p-4 pb-safe space-y-3">
              {layouts.map((layout) => {
                const Icon = layout.icon;
                const isSelected = selectedId === layout.id;
                
                return (
                  <motion.button
                    key={layout.id}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleSelect(layout)}
                    className={cn(
                      "w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all",
                      isSelected 
                        ? "border-purple-500 bg-purple-50" 
                        : "border-gray-200 bg-white hover:bg-gray-50"
                    )}
                  >
                    {/* Icon */}
                    <div className={cn(
                      "w-12 h-12 rounded-xl flex items-center justify-center",
                      isSelected 
                        ? "bg-purple-500 text-white" 
                        : "bg-gray-100 text-gray-600"
                    )}>
                      <Icon className="w-6 h-6" />
                    </div>
                    
                    {/* Text */}
                    <div className="flex-1 text-left">
                      <h4 className={cn(
                        "font-semibold",
                        isSelected ? "text-purple-700" : "text-gray-900"
                      )}>
                        {layout.name}
                      </h4>
                      <p className="text-sm text-gray-500">{layout.description}</p>
                    </div>
                    
                    {/* Check */}
                    {isSelected && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center"
                      >
                        <Check className="w-4 h-4 text-white" />
                      </motion.div>
                    )}
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default LayoutPickerPanel;
