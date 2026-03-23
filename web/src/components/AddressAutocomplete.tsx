import { useEffect, useRef, useState } from 'react';

const GOOGLE_MAPS_API_KEY = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY || '';

interface Props {
  value: string;
  onChange: (address: string) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
}

let scriptLoaded = false;
let scriptLoading = false;
const loadCallbacks: (() => void)[] = [];

function loadGoogleMapsScript(): Promise<void> {
  if (scriptLoaded) return Promise.resolve();
  return new Promise((resolve) => {
    if (scriptLoading) {
      loadCallbacks.push(resolve);
      return;
    }
    if (!GOOGLE_MAPS_API_KEY) {
      resolve();
      return;
    }
    scriptLoading = true;
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places&loading=async`;
    script.async = true;
    script.onload = () => {
      scriptLoaded = true;
      scriptLoading = false;
      resolve();
      loadCallbacks.forEach(cb => cb());
      loadCallbacks.length = 0;
    };
    script.onerror = () => {
      scriptLoading = false;
      resolve();
    };
    document.head.appendChild(script);
  });
}

export function AddressAutocomplete({ value, onChange, placeholder, className, required }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [ready, setReady] = useState(scriptLoaded);
  const [useFallback, setUseFallback] = useState(!GOOGLE_MAPS_API_KEY);

  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY) return;
    loadGoogleMapsScript().then(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!ready || !containerRef.current || useFallback) return;
    if (!GOOGLE_MAPS_API_KEY) return;

    const google = (window as any).google;
    if (!google?.maps?.places?.PlaceAutocompleteElement) {
      // New API not available, fall back to plain input
      setUseFallback(true);
      return;
    }

    try {
      const autocomplete = new google.maps.places.PlaceAutocompleteElement({
        componentRestrictions: { country: 'us' },
        types: ['address'],
      });

      // Style the element to match our input
      autocomplete.style.width = '100%';
      autocomplete.setAttribute('placeholder', placeholder || 'Start typing an address...');

      autocomplete.addEventListener('gmp-placeselect', async (event: any) => {
        const place = event.place;
        if (place) {
          await place.fetchFields({ fields: ['formattedAddress'] });
          if (place.formattedAddress) {
            onChange(place.formattedAddress);
          }
        }
      });

      // Clear container and add autocomplete
      const container = containerRef.current;
      container.innerHTML = '';
      container.appendChild(autocomplete);

      return () => {
        if (container.contains(autocomplete)) {
          container.removeChild(autocomplete);
        }
      };
    } catch {
      setUseFallback(true);
    }
  }, [ready, useFallback, onChange, placeholder]);

  if (useFallback || !GOOGLE_MAPS_API_KEY) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder || 'Start typing an address...'}
        className={className || 'input'}
        required={required}
      />
    );
  }

  return <div ref={containerRef} className={className || ''} />;
}
