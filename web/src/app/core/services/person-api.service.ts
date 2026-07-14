import { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { API_BASE_URL } from '../../pages/auth-page/auth-api-go.service';
import { Person, UpsertPersonRequest } from '../models/person.model';

interface JsendEnvelope<T> {
  status: 'success' | 'fail' | 'error';
  data: T;
  message?: string;
}

interface PersonGoData {
  id: string;
  name: string;
  identity_document: string;
  tax_id: string | null;
  whatsapp_phone: string;
  full_address: string;
  is_client: boolean;
  created_at_utc: string;
  updated_at_utc: string;
}

interface PersonLookupGoData {
  exists: boolean;
  person?: PersonGoData | null;
}

type PersonLookupResponseData = PersonLookupGoData | PersonGoData;

function isPersonLookupEnvelope(data: PersonLookupResponseData): data is PersonLookupGoData {
  return 'exists' in data;
}

@Injectable({ providedIn: 'root' })
export class PersonApiService {
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpClient,
    @Inject(API_BASE_URL) apiBaseUrl: string
  ) {
    this.baseUrl = apiBaseUrl.replace(/\/$/, '');
  }

  getByDocument(document: string, withCredentials = true): Observable<Person> {
    return this.http
      .get<JsendEnvelope<PersonLookupResponseData>>(`${this.baseUrl}/api/v1/persons/by-document/${encodeURIComponent(document)}`, {
        withCredentials,
      })
      .pipe(
        map((res) => {
          const data = res.data as PersonLookupResponseData;
          if (isPersonLookupEnvelope(data)) {
            return this.map(data.person ?? null);
          }
          return this.map(data);
        })
      );
  }

  upsert(request: UpsertPersonRequest, withCredentials = true): Observable<Person> {
    return this.http
      .post<JsendEnvelope<PersonGoData>>(`${this.baseUrl}/api/v1/persons/upsert`, {
        name: request.name,
        identity_document: request.identityDocument,
        tax_id: request.taxId,
        whatsapp_phone: request.whatsappPhone,
        full_address: request.fullAddress,
      }, {
        withCredentials,
      })
      .pipe(map((res) => this.map(res.data)));
  }

  createClient(request: UpsertPersonRequest): Observable<Person> {
    return this.http
      .post<JsendEnvelope<PersonGoData>>(`${this.baseUrl}/api/v1/persons/clients`, {
        name: request.name,
        identity_document: request.identityDocument,
        tax_id: request.taxId,
        whatsapp_phone: request.whatsappPhone,
        full_address: request.fullAddress,
      }, {
        withCredentials: true,
      })
      .pipe(map((res) => this.map(res.data)));
  }

  private map(raw: PersonGoData | null): Person {
    if (!raw) {
      throw new Error('PERSON_NOT_FOUND');
    }
    return {
      id: raw.id,
      name: raw.name,
      identityDocument: raw.identity_document,
      taxId: raw.tax_id,
      whatsappPhone: raw.whatsapp_phone,
      fullAddress: raw.full_address,
      isClient: raw.is_client,
      createdAtUtc: raw.created_at_utc,
      updatedAtUtc: raw.updated_at_utc,
    };
  }
}
