import { useStore } from "@/lib/store";
import { motion } from "framer-motion";

export function FloatingAvatars() {
  const { currentUser, users } = useStore();

  if (!currentUser) return null;

  const activeUsers = users.filter(u => u.active);

  return (
    <div className="fixed top-20 right-4 z-30 pointer-events-none">
      <div className="flex flex-col items-end gap-2">
        {activeUsers.map((user, index) => (
          <motion.div
            key={user.id}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.1, type: "spring", stiffness: 200 }}
            className="text-3xl filter drop-shadow-lg"
          >
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 3 + index * 0.5, repeat: Infinity, ease: "easeInOut" }}
            >
              {user.emoji}
            </motion.div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
