export class AuthResponseDto {
  success: boolean;
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    nickname: string;
    email: string;
    firstName: string;
    surname: string;
    role: string;
  };
}
