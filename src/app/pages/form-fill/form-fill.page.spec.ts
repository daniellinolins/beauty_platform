import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormFillPage } from './form-fill.page';

describe('FormFillPage', () => {
  let component: FormFillPage;
  let fixture: ComponentFixture<FormFillPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(FormFillPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
