<?php

namespace App\Http\Controllers;

use App\Models\ProviderKey;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Throwable;

class ProviderKeyController extends Controller
{
    public function index(): JsonResponse
    {
        $keys = ProviderKey::orderBy('provider')->get();

        return response()->json([
            'keys' => $keys,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'provider' => ['required', 'string', 'in:gemini,opencode'],
            'apiKey' => ['nullable', 'string', 'min:8', 'max:512'],
            'model' => ['nullable', 'string', 'max:120'],
            'isActive' => ['sometimes', 'boolean'],
        ]);

        $record = ProviderKey::firstOrNew(['provider' => $validated['provider']]);
        if (!empty($validated['apiKey'])) {
            $record->setPlainKey($validated['apiKey']);
            $record->last_test_status = null;
        } elseif (!$record->exists) {
            return response()->json([
                'message' => 'API key minimal 8 karakter wajib diisi saat pertama kali menyimpan.',
            ], 422);
        }

        if (array_key_exists('model', $validated)) {
            $record->model = $validated['model'] ? trim($validated['model']) : null;
        }
        $record->is_active = $validated['isActive'] ?? ($record->exists ? $record->is_active : true);
        $record->save();

        return response()->json([
            'key' => $record->fresh(),
            'message' => !empty($validated['apiKey'])
                ? 'API key & model tersimpan di PostgreSQL.'
                : 'Pilihan model tersimpan di PostgreSQL.',
        ], $record->wasRecentlyCreated ? 201 : 200);
    }

    public function models(Request $request): JsonResponse
    {
        $provider = $request->query('provider', 'opencode');
        if (!in_array($provider, ['gemini', 'opencode'], true)) {
            return response()->json(['error' => 'Provider tidak valid.'], 422);
        }

        $defaults = $provider === 'gemini'
            ? ['gemini-2.5-flash', 'gemini-3.8-flash', 'gemini-2.5-pro']
            : ['glm-5.3-flash', 'qwen-3-coder', 'deepseek-v3'];

        $stored = ProviderKey::where('provider', $provider)->first();
        $plain = $stored?->getPlainKey() ?: trim((string) env($provider === 'gemini' ? 'GEMINI_API_KEY' : 'OPENCODE_API_KEY', ''));

        $live = [];
        if ($plain !== '') {
            try {
                if ($provider === 'gemini') {
                    $resp = Http::timeout(10)->withHeaders(['x-goog-api-key' => $plain])
                        ->get('https://generativelanguage.googleapis.com/v1beta/models');
                    if ($resp->ok()) {
                        foreach ((array) $resp->json('models', []) as $m) {
                            $name = (string) ($m['name'] ?? '');
                            $short = preg_replace('/^models\//', '', $name);
                            if ($short && str_contains($short, 'gemini')) {
                                $live[] = $short;
                            }
                        }
                    }
                } else {
                    $baseUrl = rtrim((string) env('OPENCODE_BASE_URL', 'https://opencode.ai/zen/go/v1'), '/');
                    $resp = Http::timeout(10)->withToken($plain)->get("{$baseUrl}/models");
                    if ($resp->ok()) {
                        foreach ((array) $resp->json('data', []) as $m) {
                            if (!empty($m['id'])) {
                                $live[] = (string) $m['id'];
                            }
                        }
                    }
                }
            } catch (Throwable) {
                // ignore transient network errors and return defaults
            }
        }

        $models = array_values(array_unique(array_merge($defaults, $live)));

        return response()->json([
            'provider' => $provider,
            'models' => $models,
            'source' => count($live) > 0 ? 'live+defaults' : 'defaults',
        ]);
    }

    public function destroy(string $provider): JsonResponse
    {
        if (!in_array($provider, ['gemini', 'opencode'], true)) {
            return response()->json(['error' => 'Provider tidak valid.'], 422);
        }

        $deleted = ProviderKey::where('provider', $provider)->delete();

        return response()->json([
            'deleted' => $deleted > 0,
            'provider' => $provider,
        ]);
    }

    public function test(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'provider' => ['required', 'string', 'in:gemini,opencode'],
            'apiKey' => ['nullable', 'string', 'min:8', 'max:512'],
        ]);

        $provider = $validated['provider'];
        $stored = ProviderKey::where('provider', $provider)->first();
        $plain = !empty($validated['apiKey'])
            ? trim($validated['apiKey'])
            : ($stored?->getPlainKey());

        if (!$plain) {
            return response()->json([
                'ok' => false,
                'status' => 'missing',
                'message' => 'Belum ada API key yang diisi atau tersimpan untuk provider ini.',
            ], 422);
        }

        $ok = false;
        $status = 'error';
        $message = 'Gagal memverifikasi key.';

        try {
            if ($provider === 'gemini') {
                $res = Http::timeout(10)->get(
                    'https://generativelanguage.googleapis.com/v1beta/models',
                    ['key' => $plain]
                );
                if ($res->successful()) {
                    $ok = true;
                    $status = 'valid';
                    $message = 'Gemini API key valid dan terhubung.';
                } else {
                    $status = "http_{$res->status()}";
                    $message = 'Gemini menolak API key ini (HTTP ' . $res->status() . ').';
                }
            } else {
                $baseUrl = rtrim((string) env('OPENCODE_BASE_URL', 'https://opencode.ai/zen/go/v1'), '/');
                $res = Http::timeout(10)
                    ->withToken($plain)
                    ->get("{$baseUrl}/models");
                if ($res->successful()) {
                    $ok = true;
                    $status = 'valid';
                    $message = 'OpenCode API key valid dan terhubung.';
                } else {
                    $status = "http_{$res->status()}";
                    $message = 'OpenCode menolak API key ini (HTTP ' . $res->status() . ').';
                }
            }
        } catch (Throwable $e) {
            $status = 'unreachable';
            $message = 'Koneksi ke provider gagal: ' . $e->getMessage();
        }

        if ($stored && empty($validated['apiKey'])) {
            $stored->update([
                'last_tested_at' => now(),
                'last_test_status' => $status,
            ]);
        }

        return response()->json([
            'ok' => $ok,
            'status' => $status,
            'message' => $message,
        ], $ok ? 200 : 422);
    }
}
