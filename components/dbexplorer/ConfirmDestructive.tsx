'use client';

import { useTranslations } from 'next-intl';
import { Modal, Btn } from '@/components/ui';

interface ConfirmDestructiveProps {
  reason: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDestructive({ reason, onConfirm, onCancel }: ConfirmDestructiveProps) {
  const t = useTranslations();

  return (
    <Modal title={t('dbx.destructiveTitle')} onClose={onCancel} width={440}>
      <p style={{
        fontSize: '13px',
        color: 'var(--text-secondary)',
        lineHeight: 1.55,
        marginBottom: '20px',
      }}>
        {t('dbx.destructiveBody', { reason })}
      </p>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <Btn variant="default" size="sm" onClick={onCancel}>
          {t('dbx.cancel')}
        </Btn>
        <Btn
          variant="danger"
          size="sm"
          onClick={onConfirm}
          style={{
            background: 'var(--red)',
            border: '1px solid var(--red)',
            color: '#fff',
          }}
        >
          {t('dbx.confirmRun')}
        </Btn>
      </div>
    </Modal>
  );
}
