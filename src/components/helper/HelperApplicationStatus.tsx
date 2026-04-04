import { Clock, CheckCircle, XCircle, MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HelperApplicationStatusProps {
  status: 'pending' | 'approved' | 'rejected';
  adminNotes?: string;
  rejectionReason?: string;
  contactInfo?: { whatsapp?: string; telegram?: string };
  onClose?: () => void;
}

const HelperApplicationStatus = ({ 
  status, 
  adminNotes,
  rejectionReason,
  contactInfo,
  onClose 
}: HelperApplicationStatusProps) => {
  
  if (status === 'pending') {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <div className="w-20 h-20 mx-auto bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center mb-4">
            <Clock className="w-10 h-10 text-white animate-pulse" />
          </div>
          <h2 className="text-xl font-bold text-yellow-800 dark:text-yellow-300">
            Application Under Review
          </h2>
          <p className="text-sm text-muted-foreground mt-2">
            Your helper application is being reviewed by admin
          </p>
        </div>

        <div className="bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-yellow-950/30 dark:to-orange-950/30 rounded-2xl p-6 border border-yellow-200 dark:border-yellow-800">
          <h4 className="font-semibold text-yellow-800 dark:text-yellow-300 mb-3">
            What happens next?
          </h4>
          <ul className="space-y-2 text-sm text-yellow-700 dark:text-yellow-400">
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>Admin will review your application</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>If approved, payment collection will begin</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>Once payment is confirmed, you'll get Helper access</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>You'll receive a notification when approved</span>
            </li>
          </ul>
        </div>

        {/* Contact Admin */}
        {contactInfo && (contactInfo.whatsapp || contactInfo.telegram) && (
          <div className="border-t pt-4">
            <p className="text-sm text-muted-foreground text-center mb-3">
              Need help? Contact admin
            </p>
            <div className="flex gap-2">
              {contactInfo.whatsapp && (
                <a 
                  href={`https://wa.me/${contactInfo.whatsapp.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 p-3 bg-green-500 rounded-xl text-white text-sm hover:bg-green-600 transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  WhatsApp
                </a>
              )}
              {contactInfo.telegram && (
                <a 
                  href={`https://t.me/${contactInfo.telegram.replace('@', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 p-3 bg-blue-500 rounded-xl text-white text-sm hover:bg-blue-600 transition-colors"
                >
                  <Send className="w-4 h-4" />
                  Telegram
                </a>
              )}
            </div>
          </div>
        )}

        {onClose && (
          <Button variant="outline" onClick={onClose} className="w-full">
            Close
          </Button>
        )}
      </div>
    );
  }

  if (status === 'rejected') {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <div className="w-20 h-20 mx-auto bg-gradient-to-br from-red-400 to-red-600 rounded-full flex items-center justify-center mb-4">
            <XCircle className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-xl font-bold text-red-800 dark:text-red-300">
            Application Rejected
          </h2>
          <p className="text-sm text-muted-foreground mt-2">
            Unfortunately, your application was not approved
          </p>
        </div>

        {(rejectionReason || adminNotes) && (
          <div className="bg-red-50 dark:bg-red-950/30 rounded-xl p-4 border border-red-200 dark:border-red-800">
            <h4 className="font-semibold text-red-800 dark:text-red-300 mb-2">Reason</h4>
            <p className="text-sm text-red-700 dark:text-red-400">
              {rejectionReason || adminNotes || "No reason provided"}
            </p>
          </div>
        )}

        {contactInfo && (contactInfo.whatsapp || contactInfo.telegram) && (
          <div className="border-t pt-4">
            <p className="text-sm text-muted-foreground text-center mb-3">
              Have questions? Contact admin
            </p>
            <div className="flex gap-2">
              {contactInfo.whatsapp && (
                <a 
                  href={`https://wa.me/${contactInfo.whatsapp.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 p-3 bg-green-500 rounded-xl text-white text-sm"
                >
                  <MessageCircle className="w-4 h-4" />
                  WhatsApp
                </a>
              )}
              {contactInfo.telegram && (
                <a 
                  href={`https://t.me/${contactInfo.telegram.replace('@', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 p-3 bg-blue-500 rounded-xl text-white text-sm"
                >
                  <Send className="w-4 h-4" />
                  Telegram
                </a>
              )}
            </div>
          </div>
        )}

        {onClose && (
          <Button variant="outline" onClick={onClose} className="w-full">
            Close
          </Button>
        )}
      </div>
    );
  }

  // Approved status would redirect to HelperDashboard, so this shouldn't show
  return null;
};

export default HelperApplicationStatus;
