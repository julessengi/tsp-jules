import { IsString, MaxLength, MinLength } from 'class-validator';

export class RefreshDto {
  @IsString()
  @MinLength(40)
  @MaxLength(200)
  refreshToken!: string;
}