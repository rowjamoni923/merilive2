import { useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import { X, Check, RotateCcw, ZoomIn, ZoomOut, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

interface Point {
  x: number;
  y: number;
}

interface Area {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ImageCropModalProps {
  isOpen: boolean;
  imageSrc: string;
  onClose: () => void;
  onComplete: (croppedImage: Blob, filter: string) => void;
}

const FILTERS = [
  { id: "none", name: "Original", css: "" },
  { id: "bright", name: "Bright", css: "brightness(1.2)" },
  { id: "contrast", name: "Contrast", css: "contrast(1.2)" },
  { id: "warm", name: "Warm", css: "sepia(0.3) saturate(1.2)" },
  { id: "cool", name: "Cool", css: "saturate(0.8) hue-rotate(10deg)" },
  { id: "vintage", name: "Vintage", css: "sepia(0.5) contrast(1.1)" },
  { id: "fade", name: "Fade", css: "contrast(0.9) brightness(1.1) saturate(0.9)" },
  { id: "bw", name: "B&W", css: "grayscale(1)" },
  { id: "vivid", name: "Vivid", css: "saturate(1.5) contrast(1.1)" },
];

export const ImageCropModal = ({
  isOpen,
  imageSrc,
  onClose,
  onComplete,
}: ImageCropModalProps) => {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [selectedFilter, setSelectedFilter] = useState("none");
  const [processing, setProcessing] = useState(false);

  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const createImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.addEventListener("load", () => resolve(image));
      image.addEventListener("error", (error) => reject(error));
      image.crossOrigin = "anonymous";
      image.src = url;
    });

  const getCroppedImg = async (
    imageSrc: string,
    pixelCrop: Area,
    rotation = 0,
    filter = ""
  ): Promise<Blob> => {
    const image = await createImage(imageSrc);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      throw new Error("Canvas context not available");
    }

    const maxSize = Math.max(image.width, image.height);
    const safeArea = 2 * ((maxSize / 2) * Math.sqrt(2));

    canvas.width = safeArea;
    canvas.height = safeArea;

    ctx.translate(safeArea / 2, safeArea / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-safeArea / 2, -safeArea / 2);

    if (filter) {
      ctx.filter = filter;
    }

    ctx.drawImage(
      image,
      safeArea / 2 - image.width / 2,
      safeArea / 2 - image.height / 2
    );

    const data = ctx.getImageData(0, 0, safeArea, safeArea);

    canvas.width = pixelCrop.width;
    canvas.height = pixelCrop.height;

    ctx.putImageData(
      data,
      Math.round(0 - safeArea / 2 + image.width / 2 - pixelCrop.x),
      Math.round(0 - safeArea / 2 + image.height / 2 - pixelCrop.y)
    );

    return new Promise((resolve) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
        },
        "image/jpeg",
        0.9
      );
    });
  };

  const handleComplete = async () => {
    if (!croppedAreaPixels) return;

    setProcessing(true);
    try {
      const filterCss = FILTERS.find((f) => f.id === selectedFilter)?.css || "";
      const croppedImage = await getCroppedImg(
        imageSrc,
        croppedAreaPixels,
        rotation,
        filterCss
      );
      onComplete(croppedImage, selectedFilter);
    } catch (error) {
      console.error("Crop error:", error);
    } finally {
      setProcessing(false);
    }
  };

  const handleReset = () => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setSelectedFilter("none");
  };

  const getFilterStyle = (filterId: string) => {
    return FILTERS.find((f) => f.id === filterId)?.css || "";
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-white/80"
        >
          {/* Header */}
          <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-gradient-to-b from-amber-50 to-transparent">
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-6 h-6 text-white" />
            </Button>
            <h2 className="text-white font-semibold">Edit Photo</h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleComplete}
              disabled={processing}
            >
              {processing ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Check className="w-6 h-6 text-green-500" />
              )}
            </Button>
          </div>

          {/* Cropper */}
          <div className="absolute top-16 bottom-48 left-0 right-0">
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              style={{
                containerStyle: {
                  background: "#000",
                },
                mediaStyle: {
                  filter: getFilterStyle(selectedFilter),
                },
              }}
            />
          </div>

          {/* Controls */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-amber-50 via-rose-50 to-transparent pt-8 pb-6 px-4">
            {/* Zoom & Rotation Controls */}
            <div className="flex items-center gap-4 mb-4">
              <ZoomOut className="w-4 h-4 text-slate-500" />
              <Slider
                value={[zoom]}
                min={1}
                max={3}
                step={0.1}
                onValueChange={(value) => setZoom(value[0])}
                className="flex-1"
              />
              <ZoomIn className="w-4 h-4 text-slate-500" />
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRotation((r) => r + 90)}
                className="text-slate-500 hover:text-white"
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="text-slate-500 hover:text-white"
              >
                Reset
              </Button>
            </div>

            {/* Filters */}
            <div className="mb-2">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-sm text-slate-700">Filters</span>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                {FILTERS.map((filter) => (
                  <button
                    key={filter.id}
                    onClick={() => setSelectedFilter(filter.id)}
                    className={`flex-shrink-0 flex flex-col items-center gap-1 p-1 rounded-lg transition-all ${
                      selectedFilter === filter.id
                        ? "bg-primary/20 ring-2 ring-primary"
                        : "bg-white/10"
                    }`}
                  >
                    <div
                      className="w-14 h-14 rounded-lg overflow-hidden"
                      style={{ filter: filter.css }}
                    >
                      <img
                        src={imageSrc}
                        alt={filter.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <span className="text-[10px] text-slate-600">{filter.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
