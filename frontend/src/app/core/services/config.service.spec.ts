import { TestBed } from '@angular/core/testing';
import { ConfigService } from './config.service';
import { environment } from '../../../environments/environment';

describe('ConfigService', () => {
  let service: ConfigService;
  const originalApiOrigin = environment.apiOrigin;
  const originalBaseUrl = environment.baseUrl;
  const originalMqttUrl = environment.mqttUrl;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ConfigService],
    });

    service = TestBed.inject(ConfigService);
  });

  afterEach(() => {
    environment.apiOrigin = originalApiOrigin;
    environment.baseUrl = originalBaseUrl;
    environment.mqttUrl = originalMqttUrl;
    window.history.replaceState({}, '', '/');
  });

  it('builds apiBaseUrl from apiOrigin after trimming whitespace and trailing slashes', () => {
    environment.apiOrigin = ' http://example.test/// ';

    expect(service.apiBaseUrl).toBe('http://example.test/api');
  });

  it('falls back to baseUrl when apiOrigin is empty', () => {
    environment.apiOrigin = '   ';
    environment.baseUrl = '/api';

    expect(service.apiBaseUrl).toBe('/api');
  });

  it('uses the explicit mqttUrl when one is configured', () => {
    environment.mqttUrl = ' ws://broker.test/custom ';

    expect(service.mqttUrl).toBe('ws://broker.test/custom');
  });

  it('derives mqttUrl from apiOrigin when mqttUrl is not configured', () => {
    environment.mqttUrl = '';
    environment.apiOrigin = 'https://example.test/';

    expect(service.mqttUrl).toBe('wss://example.test/mqtt');
  });
});
