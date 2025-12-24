import { motion, AnimatePresence } from 'framer-motion'
import { Check, AlertCircle, Info, X } from 'lucide-react'

export interface Notification {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
}

export const Toast = ({ notifications, remove }: { notifications: Notification[], remove: (id: string) => void }) => (
  <div className="fixed bottom-8 right-8 z-[200] flex flex-col gap-3 pointer-events-none">
    <AnimatePresence mode="popLayout">
      {notifications.map((n) => (
        <motion.div
          key={n.id}
          layout
          initial={{ opacity: 0, x: 50, scale: 0.9 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
          className={`pointer-events-auto flex items-center gap-3 px-6 py-4 min-w-[300px] border shadow-2xl backdrop-blur-xl ${
            n.type === 'success' ? 'bg-primary/90 border-primary text-primary-foreground' : 
            n.type === 'error' ? 'bg-destructive/90 border-destructive text-destructive-foreground' : 
            'bg-muted/90 border-border text-foreground'
          }`}
        >
          {n.type === 'success' && <Check className="w-5 h-5" />}
          {n.type === 'error' && <AlertCircle className="w-5 h-5" />}
          {n.type === 'info' && <Info className="w-5 h-5" />}
          <span className="text-[10px] font-bold uppercase tracking-widest flex-1 leading-relaxed">{n.message}</span>
          <button onClick={() => remove(n.id)} className="p-1 hover:opacity-70 transition-opacity">
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      ))}
    </AnimatePresence>
  </div>
)
