-- AlterEnum
ALTER TYPE "ReservationStatus" ADD VALUE 'WAITLIST';

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "customerConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "reminderSentAt" TIMESTAMP(3),
ADD COLUMN     "waitlistNotifiedAt" TIMESTAMP(3);
