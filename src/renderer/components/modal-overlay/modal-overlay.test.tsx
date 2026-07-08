import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ModalOverlay } from './modal-overlay';

describe('ModalOverlay', () => {
  it('renders its children', () => {
    render(
      <ModalOverlay>
        <p>Overlay content</p>
      </ModalOverlay>,
    );
    expect(screen.getByText('Overlay content')).toBeInTheDocument();
  });
});
