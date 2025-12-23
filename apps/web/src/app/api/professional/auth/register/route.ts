import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();

    const response = await fetch(`${API_BASE_URL}/professional/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return NextResponse.json(errorData, { status: response.status });
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    console.error('Professional registration error:', error);
    return NextResponse.json(
      { message: 'Registration failed', error: String(error) },
      { status: 500 },
    );
  }
}
