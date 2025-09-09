import { IsString, IsStrongPassword } from 'class-validator';

export class CreateAdminDto {
  @IsString()
  userName: string;

  @IsStrongPassword()
  password: string;
}
