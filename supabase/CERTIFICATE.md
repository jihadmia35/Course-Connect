# Supabase database TLS certificate

`prod-ca-2021.crt` is Supabase’s public root CA, downloaded over verified HTTPS from [Supabase’s certificate distribution](https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt). It contains no private key or project credentials.

The local connection uses `sslmode=verify-full` and `sslrootcert=supabase%2Fprod-ca-2021.crt`, preserving certificate and hostname verification. The path is relative to the project root. The Next.js configuration includes the certificate in server deployment tracing. See [Supabase SSL guidance](https://supabase.com/docs/guides/database/connecting-to-postgres#ssl).
