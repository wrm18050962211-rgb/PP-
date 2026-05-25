import type { Companion } from '../types/api';
import { BookingModal } from './booking/BookingModal';

type BookingSheetProps = {
  companion: Companion;
  postId: string;
  open: boolean;
  onClose: () => void;
};

export function BookingSheet(props: BookingSheetProps) {
  return <BookingModal {...props} />;
}
